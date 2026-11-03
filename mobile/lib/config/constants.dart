import 'package:flutter/material.dart';

class AppConstants {
  // Default for Physical Device on local Wi-Fi + Docker (Port 5173)
  static const String defaultBaseUrl = 'http://192.168.1.41:5173/api/v1';

  // Storage keys
  static const String keyToken = 'assetos_auth_token';
  static const String keyBaseUrl = 'assetos_base_url';
  static const String keyUser = 'assetos_cached_user';
  static const String keyOrgId = 'assetos_active_org_id';

  // --- Exact Figma Design System Tokens ---
  // Palette
  static const Color primaryNavy = Color(0xFF172554); // --primary-500
  static const Color accentTeal = Color(0xFF0F766E);  // --accent
  static const Color backgroundColor = Color(0xFFF8FAFC); // Canvas
  static const Color surfaceColor = Color(0xFFFFFFFF);    // Panels / Cards
  static const Color textPrimary = Color(0xFF0F172A);     // Main text
  static const Color textSecondary = Color(0xFF475569);   // Secondary / Subtitle
  static const Color borderLight = Color(0xFFE2E8F0);     // 1px subtle borders

  // Status Badges (Background + Foreground)
  static const Color badgeSuccessBg = Color(0xFFDCFCE7);
  static const Color badgeSuccessText = Color(0xFF166534);

  static const Color badgeWarningBg = Color(0xFFFEF3C7);
  static const Color badgeWarningText = Color(0xFF92400E);

  static const Color badgeErrorBg = Color(0xFFFEE2E2);
  static const Color badgeErrorText = Color(0xFF991B1B);

  static const Color badgeNeutralBg = Color(0xFFF1F5F9);
  static const Color badgeNeutralText = Color(0xFF475569);

  // Geometric Foundations
  static const double radiusControl = 8.0;   // Buttons, Inputs, Icon-buttons
  static const double radiusCard = 12.0;     // Asset Cards, Panels
  static const double radiusPill = 99.0;     // Status badges
  static const double controlHeight = 48.0;  // Standard touch target
}
