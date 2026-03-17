package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/monmon-io/monmon/internal/diff"
	"github.com/monmon-io/monmon/internal/models"
)

func (s *Server) handleListChecks(c *gin.Context) {
	taskID, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "25"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 || perPage > 100 {
		perPage = 25
	}

	query := s.DB.Model(&models.Check{}).Where("task_id = ?", taskID)
	if st := c.Query("status"); st != "" {
		query = query.Where("status = ?", st)
	}

	var total int64
	query.Count(&total)

	order := "DESC"
	if c.Query("order") == "asc" {
		order = "ASC"
	}

	var checks []models.Check
	query.Order("version " + order).
		Offset((page - 1) * perPage).
		Limit(perPage).
		Find(&checks)

	c.JSON(http.StatusOK, gin.H{
		"data":     checks,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

func (s *Server) handleGetCheck(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var check models.Check
	if err := s.DB.First(&check, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "check not found"})
		return
	}
	c.JSON(http.StatusOK, check)
}

func (s *Server) handleGetCheckOutput(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var check models.Check
	if err := s.DB.First(&check, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "check not found"})
		return
	}
	c.String(http.StatusOK, check.Output)
}

// parseMultiURLOutput splits a multi-URL endpoint output into ordered URLs and per-URL content.
// Returns empty slice if the output does not use [url] markers (single-URL or non-endpoint tasks).
func parseMultiURLOutput(output string) (urls []string, contents map[string]string) {
	contents = make(map[string]string)
	var curURL string
	var curLines []string

	for _, line := range strings.Split(output, "\n") {
		// URL marker: [https://...]
		if len(line) > 4 && line[0] == '[' && line[len(line)-1] == ']' {
			inner := line[1 : len(line)-1]
			if strings.HasPrefix(inner, "http://") || strings.HasPrefix(inner, "https://") {
				if curURL != "" {
					contents[curURL] = strings.Join(curLines, "\n")
				}
				curURL = inner
				urls = append(urls, curURL)
				curLines = nil
				continue
			}
		}
		// Skip the --- separator between URL sections
		if line == "---" {
			continue
		}
		if curURL != "" {
			curLines = append(curLines, line)
		}
	}
	if curURL != "" {
		contents[curURL] = strings.Join(curLines, "\n")
	}
	return
}

func (s *Server) handleGetCheckDiff(c *gin.Context) {
	id, _ := strconv.ParseUint(c.Param("id"), 10, 64)
	var check models.Check
	if err := s.DB.First(&check, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "check not found"})
		return
	}

	// Try to parse as multi-URL output (endpoint tasks)
	urls, contents := parseMultiURLOutput(check.Output)
	if len(urls) == 0 {
		// Single output (command / subdomain / bbscope)
		// Compute which added lines appear for the first time ever in this task.
		historical := s.historicalLines(check.TaskID, check.Version)
		ftLines := firstTimeAddedLines(check.DiffText, historical)
		c.JSON(http.StatusOK, gin.H{
			"is_multi":         false,
			"diff":             check.DiffText,
			"first_time_lines": ftLines,
			"first_time_added": len(ftLines),
		})
		return
	}

	// Multi-URL: fetch previous check to compute per-URL diffs
	var prevCheck models.Check
	s.DB.Where("task_id = ? AND version = ?", check.TaskID, check.Version-1).First(&prevCheck)

	_, prevContents := parseMultiURLOutput(prevCheck.Output) // empty map when no previous check

	type Section struct {
		URL        string `json:"url"`
		HasChanges bool   `json:"has_changes"`
		Added      int    `json:"added"`
		Removed    int    `json:"removed"`
		Diff       string `json:"diff"`
	}

	sections := make([]Section, 0, len(urls))
	totalAdded, totalRemoved := 0, 0

	for _, url := range urls {
		curr := contents[url]
		prev := prevContents[url] // empty string if URL not in prev or no previous check

		diffText, added, removed := diff.ComputeDiff(prev, curr)
		totalAdded += added
		totalRemoved += removed

		sections = append(sections, Section{
			URL:        url,
			HasChanges: added > 0 || removed > 0,
			Added:      added,
			Removed:    removed,
			Diff:       diffText,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"is_multi":      true,
		"total_added":   totalAdded,
		"total_removed": totalRemoved,
		"sections":      sections,
	})
}

// historicalLines returns the set of all unique non-empty lines produced by a task
// in all versions strictly before beforeVersion (i.e. the full seen-corpus up to now).
func (s *Server) historicalLines(taskID uint, beforeVersion int) map[string]bool {
	var rows []struct{ Output string }
	s.DB.Model(&models.Check{}).
		Select("output").
		Where("task_id = ? AND version < ?", taskID, beforeVersion).
		Scan(&rows)

	seen := make(map[string]bool)
	for _, r := range rows {
		for _, line := range strings.Split(r.Output, "\n") {
			if line != "" {
				seen[line] = true
			}
		}
	}
	return seen
}

// firstTimeAddedLines returns the content (without leading '+') of lines in diffText
// that are additions (start with '+', not '+++') and have never appeared in historical.
// Results are deduplicated.
func firstTimeAddedLines(diffText string, historical map[string]bool) []string {
	var result []string
	inResult := make(map[string]bool)
	for _, line := range strings.Split(diffText, "\n") {
		if len(line) > 0 && line[0] == '+' && !strings.HasPrefix(line, "+++") {
			content := line[1:]
			if !historical[content] && !inResult[content] {
				inResult[content] = true
				result = append(result, content)
			}
		}
	}
	return result
}

func (s *Server) handleCompareChecks(c *gin.Context) {
	fromID, _ := strconv.ParseUint(c.Query("from"), 10, 64)
	toID, _ := strconv.ParseUint(c.Query("to"), 10, 64)
	if fromID == 0 || toID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from and to query params required"})
		return
	}

	var fromCheck, toCheck models.Check
	if err := s.DB.First(&fromCheck, fromID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "from check not found"})
		return
	}
	if err := s.DB.First(&toCheck, toID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "to check not found"})
		return
	}

	diffText, added, removed := diff.ComputeDiff(fromCheck.Output, toCheck.Output)

	c.JSON(http.StatusOK, gin.H{
		"from_version": fromCheck.Version,
		"to_version":   toCheck.Version,
		"diff":         diffText,
		"added":        added,
		"removed":      removed,
	})
}
