package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/0xNayel/MonMon/internal/config"
	"github.com/0xNayel/MonMon/internal/models"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func setupTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Silent),
	})
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	db.AutoMigrate(&models.User{})
	return db
}

func setupAuthService(t *testing.T) *AuthService {
	t.Helper()
	db := setupTestDB(t)
	cfg := config.AuthConfig{
		JWTSecret:       "test-secret-key-for-testing",
		CredentialsFile: "", // skip file sync
	}
	return NewAuthService(db, cfg)
}

func TestLogin_CorrectCredentials(t *testing.T) {
	svc := setupAuthService(t)

	// Default user is monmon:monmon (seeded by NewAuthService)
	token, err := svc.Login("monmon", "monmon")
	if err != nil {
		t.Fatalf("expected successful login, got error: %v", err)
	}
	if token == "" {
		t.Error("expected non-empty JWT token")
	}
}

func TestLogin_WrongPassword(t *testing.T) {
	svc := setupAuthService(t)

	_, err := svc.Login("monmon", "wrongpassword")
	if err == nil {
		t.Error("expected error for wrong password")
	}
}

func TestLogin_NonexistentUser(t *testing.T) {
	svc := setupAuthService(t)

	_, err := svc.Login("nobody", "password")
	if err == nil {
		t.Error("expected error for nonexistent user")
	}
}

func TestAuthMiddleware_ValidToken(t *testing.T) {
	svc := setupAuthService(t)

	token, err := svc.Login("monmon", "monmon")
	if err != nil {
		t.Fatalf("login failed: %v", err)
	}

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(svc.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		username, _ := c.Get("username")
		c.JSON(http.StatusOK, gin.H{"username": username})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d; body: %s", w.Code, w.Body.String())
	}
}

func TestAuthMiddleware_MissingToken(t *testing.T) {
	svc := setupAuthService(t)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(svc.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}

func TestAuthMiddleware_InvalidToken(t *testing.T) {
	svc := setupAuthService(t)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(svc.AuthMiddleware())
	r.GET("/protected", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{})
	})

	req := httptest.NewRequest(http.MethodGet, "/protected", nil)
	req.Header.Set("Authorization", "Bearer invalid.token.here")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("expected 401, got %d", w.Code)
	}
}
