package auth

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/0xNayel/MonMon/internal/config"
	"github.com/0xNayel/MonMon/internal/models"
	"golang.org/x/crypto/bcrypt"
	"gopkg.in/yaml.v3"
	"gorm.io/gorm"
)

// credentialsFile represents the YAML credentials file structure.
type credentialsFile struct {
	Users []credentialEntry `yaml:"users"`
}

type credentialEntry struct {
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// AuthService handles authentication operations.
type AuthService struct {
	db  *gorm.DB
	cfg config.AuthConfig
}

// NewAuthService creates an AuthService, seeds default credentials if needed,
// and syncs from the credentials file if present.
func NewAuthService(db *gorm.DB, cfg config.AuthConfig) *AuthService {
	s := &AuthService{db: db, cfg: cfg}
	s.seedDefaults()
	s.syncCredentialsFile()
	s.syncEnvUser()
	return s
}

// seedDefaults creates the default monmon:monmon user if no users exist.
func (s *AuthService) seedDefaults() {
	var count int64
	s.db.Model(&models.User{}).Count(&count)
	if count > 0 {
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("monmon"), bcrypt.DefaultCost)
	if err != nil {
		return
	}
	s.db.Create(&models.User{
		Username:     "monmon",
		PasswordHash: string(hash),
	})
}

// syncCredentialsFile reads the credentials YAML file and updates the DB if it
// differs from the current state.
func (s *AuthService) syncCredentialsFile() {
	path := s.cfg.CredentialsFile
	if path == "" {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return // file doesn't exist or unreadable — skip
	}

	var creds credentialsFile
	if err := yaml.Unmarshal(data, &creds); err != nil {
		return
	}

	for _, entry := range creds.Users {
		if entry.Username == "" || entry.Password == "" {
			continue
		}
		var user models.User
		result := s.db.Where("username = ?", entry.Username).First(&user)

		hash, err := bcrypt.GenerateFromPassword([]byte(entry.Password), bcrypt.DefaultCost)
		if err != nil {
			continue
		}

		if errors.Is(result.Error, gorm.ErrRecordNotFound) {
			// Create new user from credentials file.
			s.db.Create(&models.User{
				Username:     entry.Username,
				PasswordHash: string(hash),
			})
		} else if result.Error == nil {
			// Update only if the password actually changed.
			if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(entry.Password)) != nil {
				s.db.Model(&user).Update("password_hash", string(hash))
			}
		}
	}
}

// Login validates credentials and returns a signed JWT valid for 24 hours.
func (s *AuthService) Login(username, password string) (string, error) {
	var user models.User
	if err := s.db.Where("username = ?", username).First(&user).Error; err != nil {
		return "", fmt.Errorf("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return "", fmt.Errorf("invalid credentials")
	}

	now := time.Now()
	claims := jwt.MapClaims{
		"user_id":  user.ID,
		"username": user.Username,
		"exp":      now.Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(s.cfg.JWTSecret))
	if err != nil {
		return "", fmt.Errorf("signing token: %w", err)
	}
	return signed, nil
}

// AuthMiddleware returns a Gin middleware that validates JWT tokens.
// It accepts tokens from the Authorization: Bearer header OR from the
// ?token= query parameter (required for WebSocket connections which
// cannot set custom headers from browsers).
func (s *AuthService) AuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenStr := ""
		if header := c.GetHeader("Authorization"); header != "" && strings.HasPrefix(header, "Bearer ") {
			tokenStr = strings.TrimPrefix(header, "Bearer ")
		} else if t := c.Query("token"); t != "" {
			tokenStr = t
		}
		if tokenStr == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid authorization header"})
			return
		}

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
			}
			return []byte(s.cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token claims"})
			return
		}

		c.Set("user_id", claims["user_id"])
		c.Set("username", claims["username"])
		c.Next()
	}
}

// syncEnvUser creates or updates a user from MONMON_ADMIN_USER / MONMON_ADMIN_PASSWORD env vars.
func (s *AuthService) syncEnvUser() {
	username := os.Getenv("MONMON_ADMIN_USER")
	password := os.Getenv("MONMON_ADMIN_PASSWORD")
	if username == "" || password == "" {
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return
	}
	var user models.User
	result := s.db.Where("username = ?", username).First(&user)
	if errors.Is(result.Error, gorm.ErrRecordNotFound) {
		s.db.Create(&models.User{Username: username, PasswordHash: string(hash)})
	} else if result.Error == nil {
		if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
			s.db.Model(&user).Update("password_hash", string(hash))
		}
	}
}
