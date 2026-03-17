// Package diff provides unified-diff generation for text comparison.
package diff

import (
	"fmt"
	"strings"

	dmp "github.com/sergi/go-diff/diffmatchpatch"
)

// ComputeDiff produces a unified diff between oldText and newText.
// It returns the diff text in unified format, plus counts of added and removed lines.
// If the texts are identical, it returns ("", 0, 0).
// If oldText is empty (first check), all lines in newText are counted as added.
func ComputeDiff(oldText, newText string) (diffText string, added int, removed int) {
	if oldText == newText {
		return "", 0, 0
	}

	oldLines := splitLines(oldText)
	newLines := splitLines(newText)

	// Use go-diff to compute character-level diffs, then convert to line diffs.
	d := dmp.New()
	a, b, lines := d.DiffLinesToChars(oldText, newText)
	diffs := d.DiffMain(a, b, false)
	diffs = d.DiffCharsToLines(diffs, lines)
	diffs = d.DiffCleanupSemantic(diffs)

	// Count added/removed lines.
	for _, chunk := range diffs {
		text := chunk.Text
		count := countLines(text)
		switch chunk.Type {
		case dmp.DiffInsert:
			added += count
		case dmp.DiffDelete:
			removed += count
		}
	}

	// Build unified diff output.
	var buf strings.Builder
	buf.WriteString("--- previous\n")
	buf.WriteString("+++ current\n")

	// Generate hunks from the diffs.
	hunks := buildHunks(diffs, oldLines, newLines)
	buf.WriteString(hunks)

	return buf.String(), added, removed
}

// countLines counts the number of lines in s (each terminated or partial line).
func countLines(s string) int {
	if s == "" {
		return 0
	}
	n := strings.Count(s, "\n")
	if !strings.HasSuffix(s, "\n") {
		n++
	}
	return n
}

// splitLines splits text into lines preserving content (no trailing empty from final newline).
func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

// buildHunks converts dmp diffs into unified-diff hunk text.
func buildHunks(diffs []dmp.Diff, oldLines, newLines []string) string {
	var buf strings.Builder
	oldPos := 1
	newPos := 1

	// We produce one big hunk for simplicity.
	oldLen := len(oldLines)
	newLen := len(newLines)
	buf.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n", oldPos, oldLen, newPos, newLen))

	for _, chunk := range diffs {
		lines := splitLines(chunk.Text)
		switch chunk.Type {
		case dmp.DiffEqual:
			for _, l := range lines {
				buf.WriteString(" " + l + "\n")
			}
		case dmp.DiffDelete:
			for _, l := range lines {
				buf.WriteString("-" + l + "\n")
			}
		case dmp.DiffInsert:
			for _, l := range lines {
				buf.WriteString("+" + l + "\n")
			}
		}
	}

	return buf.String()
}
