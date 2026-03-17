package diff

import (
	"strings"
	"testing"
)

func TestComputeDiff_Identical(t *testing.T) {
	text := "line1\nline2\nline3\n"
	diffText, added, removed := ComputeDiff(text, text)
	if diffText != "" {
		t.Errorf("expected empty diff, got %q", diffText)
	}
	if added != 0 || removed != 0 {
		t.Errorf("expected 0 added/removed, got added=%d removed=%d", added, removed)
	}
}

func TestComputeDiff_SimpleAddition(t *testing.T) {
	old := "line1\nline2\n"
	new := "line1\nline2\nline3\n"
	diffText, added, removed := ComputeDiff(old, new)
	if added != 1 {
		t.Errorf("expected 1 added, got %d", added)
	}
	if removed != 0 {
		t.Errorf("expected 0 removed, got %d", removed)
	}
	if !strings.Contains(diffText, "+line3") {
		t.Errorf("diff should contain '+line3', got:\n%s", diffText)
	}
}

func TestComputeDiff_SimpleRemoval(t *testing.T) {
	old := "line1\nline2\nline3\n"
	new := "line1\nline2\n"
	diffText, added, removed := ComputeDiff(old, new)
	if removed != 1 {
		t.Errorf("expected 1 removed, got %d", removed)
	}
	if added != 0 {
		t.Errorf("expected 0 added, got %d", added)
	}
	if !strings.Contains(diffText, "-line3") {
		t.Errorf("diff should contain '-line3', got:\n%s", diffText)
	}
}

func TestComputeDiff_CompleteChange(t *testing.T) {
	old := "alpha\nbeta\n"
	new := "gamma\ndelta\n"
	_, added, removed := ComputeDiff(old, new)
	if added == 0 {
		t.Error("expected added > 0")
	}
	if removed == 0 {
		t.Error("expected removed > 0")
	}
}

func TestComputeDiff_EmptyOld(t *testing.T) {
	new := "line1\nline2\nline3\n"
	diffText, added, removed := ComputeDiff("", new)
	if added != 3 {
		t.Errorf("expected 3 added, got %d", added)
	}
	if removed != 0 {
		t.Errorf("expected 0 removed, got %d", removed)
	}
	if !strings.Contains(diffText, "+line1") {
		t.Errorf("diff should show added lines, got:\n%s", diffText)
	}
}

func TestComputeDiff_EmptyNew(t *testing.T) {
	old := "line1\nline2\n"
	_, added, removed := ComputeDiff(old, "")
	if removed != 2 {
		t.Errorf("expected 2 removed, got %d", removed)
	}
	if added != 0 {
		t.Errorf("expected 0 added, got %d", added)
	}
}

func TestComputeDiff_LargeMultiline(t *testing.T) {
	var oldLines, newLines []string
	for i := 0; i < 100; i++ {
		oldLines = append(oldLines, "old line")
	}
	for i := 0; i < 120; i++ {
		newLines = append(newLines, "new line")
	}
	old := strings.Join(oldLines, "\n") + "\n"
	new := strings.Join(newLines, "\n") + "\n"
	diffText, added, removed := ComputeDiff(old, new)
	if added == 0 || removed == 0 {
		t.Errorf("expected both added and removed > 0, got added=%d removed=%d", added, removed)
	}
	if diffText == "" {
		t.Error("expected non-empty diff text")
	}
	if !strings.Contains(diffText, "---") {
		t.Error("expected unified diff header")
	}
}
