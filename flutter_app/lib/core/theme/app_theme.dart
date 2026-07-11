import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

class AppTheme {
  const AppTheme._();

  // ── Slate palette (matches Tailwind / web) ──
  static const Color slate900 = Color(0xFF0F172A);
  static const Color slate800 = Color(0xFF1E293B);
  static const Color slate700 = Color(0xFF334155);
  static const Color slate600 = Color(0xFF475569);
  static const Color slate500 = Color(0xFF64748B);
  static const Color slate400 = Color(0xFF94A3B8);
  static const Color slate300 = Color(0xFFCBD5E1);
  static const Color slate200 = Color(0xFFE2E8F0);
  static const Color slate100 = Color(0xFFF1F5F9);

  // ── Accent colors ──
  static const Color blue500 = Color(0xFF3B82F6);
  static const Color blue400 = Color(0xFF60A5FA);
  static const Color green500 = Color(0xFF22C55E);
  static const Color red500 = Color(0xFFEF4444);
  static const Color orange500 = Color(0xFFF97316);
  static const Color yellow500 = Color(0xFFEAB308);
  static const Color amber400 = Color(0xFFFBBF24);
  static const Color purple500 = Color(0xFFA855F7);
  static const Color indigo500 = Color(0xFF6366F1);

  // ── System UI chrome ──
  static const SystemUiOverlayStyle systemUiStyle = SystemUiOverlayStyle(
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarIconBrightness: Brightness.light,
  );

  static ThemeData get dark {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: slate900,
      colorScheme: const ColorScheme.dark(
        primary: blue500,
        onPrimary: Colors.white,
        secondary: blue400,
        surface: slate800,
        onSurface: Colors.white,
        error: red500,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: slate900,
        foregroundColor: Colors.white,
        elevation: 0,
        systemOverlayStyle: systemUiStyle,
      ),
      cardTheme: CardThemeData(
        color: slate800,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: const BorderSide(color: slate700, width: 0.5),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: slate900,
        selectedItemColor: blue400,
        unselectedItemColor: slate500,
        type: BottomNavigationBarType.fixed,
        elevation: 8,
      ),
      chipTheme: ChipThemeData(
        backgroundColor: slate700,
        selectedColor: blue500,
        labelStyle: const TextStyle(color: Colors.white, fontSize: 13),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        side: BorderSide.none,
      ),
      tabBarTheme: const TabBarThemeData(
        labelColor: blue400,
        unselectedLabelColor: slate400,
        indicatorColor: blue400,
        dividerColor: slate700,
      ),
      dividerTheme: const DividerThemeData(
        color: slate700,
        thickness: 0.5,
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: slate800,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: slate700),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: slate700),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: blue500, width: 1.5),
        ),
        hintStyle: const TextStyle(color: slate500),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      ),
      textTheme: const TextTheme(
        headlineLarge:
            TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        headlineMedium:
            TextStyle(color: Colors.white, fontWeight: FontWeight.bold),
        headlineSmall:
            TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        titleLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
        titleMedium:
            TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
        titleSmall: TextStyle(color: slate300, fontWeight: FontWeight.w500),
        bodyLarge: TextStyle(color: Colors.white),
        bodyMedium: TextStyle(color: slate300),
        bodySmall: TextStyle(color: slate400),
        labelLarge: TextStyle(color: Colors.white, fontWeight: FontWeight.w500),
        labelMedium: TextStyle(color: slate300),
        labelSmall: TextStyle(color: slate500),
      ),
      iconTheme: const IconThemeData(color: slate400),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: blue500,
        foregroundColor: Colors.white,
      ),
    );
  }
}
