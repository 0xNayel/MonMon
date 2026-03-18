package api

import (
	"net/http"
	"os/exec"

	"github.com/gin-gonic/gin"
	"github.com/0xNayel/MonMon/internal/updater"
)

type toolEntry struct {
	Name       string   `json:"name"`
	Found      bool     `json:"found"`
	Path       string   `json:"path"`
	RequiredBy []string `json:"required_by"`
}

func (s *Server) handleToolsCheck(c *gin.Context) {
	candidates := []struct {
		name       string
		requiredBy []string
	}{
		{"subfinder", []string{"subdomain"}},
		{"httpx", []string{"subdomain"}},
		{"bbscope", []string{"bbscope"}},
		{"oathtool", []string{"bbscope"}},
	}

	tools := make([]toolEntry, 0, len(candidates))
	allOK := true

	for _, tc := range candidates {
		path, err := exec.LookPath(tc.name)
		found := err == nil
		if !found {
			allOK = false
		}
		tools = append(tools, toolEntry{
			Name:       tc.name,
			Found:      found,
			Path:       path,
			RequiredBy: tc.requiredBy,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"tools":  tools,
		"all_ok": allOK,
	})
}

func (s *Server) handleVersionCheck(c *gin.Context) {
	info, err := updater.CheckLatest(s.Version)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"current":          s.Version,
			"latest":           s.Version,
			"update_available": false,
			"error":            err.Error(),
		})
		return
	}
	c.JSON(http.StatusOK, info)
}
