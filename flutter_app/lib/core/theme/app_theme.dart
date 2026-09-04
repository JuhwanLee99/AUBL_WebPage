import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

@immutable
class AublColors extends ThemeExtension<AublColors> {
  const AublColors({
    required this.canvas,
    required this.surface,
    required this.surfaceMuted,
    required this.ink,
    required this.muted,
    required this.line,
    required this.lineStrong,
    required this.navy,
    required this.navyStrong,
    required this.cobalt,
    required this.focus,
    required this.success,
    required this.warning,
    required this.danger,
  });

  final Color canvas;
  final Color surface;
  final Color surfaceMuted;
  final Color ink;
  final Color muted;
  final Color line;
  final Color lineStrong;
  final Color navy;
  final Color navyStrong;
  final Color cobalt;
  final Color focus;
  final Color success;
  final Color warning;
  final Color danger;

  @override
  AublColors copyWith({
    Color? canvas,
    Color? surface,
    Color? surfaceMuted,
    Color? ink,
    Color? muted,
    Color? line,
    Color? lineStrong,
    Color? navy,
    Color? navyStrong,
    Color? cobalt,
    Color? focus,
    Color? success,
    Color? warning,
    Color? danger,
  }) {
    return AublColors(
      canvas: canvas ?? this.canvas,
      surface: surface ?? this.surface,
      surfaceMuted: surfaceMuted ?? this.surfaceMuted,
      ink: ink ?? this.ink,
      muted: muted ?? this.muted,
      line: line ?? this.line,
      lineStrong: lineStrong ?? this.lineStrong,
      navy: navy ?? this.navy,
      navyStrong: navyStrong ?? this.navyStrong,
      cobalt: cobalt ?? this.cobalt,
      focus: focus ?? this.focus,
      success: success ?? this.success,
      warning: warning ?? this.warning,
      danger: danger ?? this.danger,
    );
  }

  @override
  AublColors lerp(covariant AublColors? other, double t) {
    if (other == null) return this;
    return AublColors(
      canvas: Color.lerp(canvas, other.canvas, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      surfaceMuted: Color.lerp(surfaceMuted, other.surfaceMuted, t)!,
      ink: Color.lerp(ink, other.ink, t)!,
      muted: Color.lerp(muted, other.muted, t)!,
      line: Color.lerp(line, other.line, t)!,
      lineStrong: Color.lerp(lineStrong, other.lineStrong, t)!,
      navy: Color.lerp(navy, other.navy, t)!,
      navyStrong: Color.lerp(navyStrong, other.navyStrong, t)!,
      cobalt: Color.lerp(cobalt, other.cobalt, t)!,
      focus: Color.lerp(focus, other.focus, t)!,
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      danger: Color.lerp(danger, other.danger, t)!,
    );
  }
}

extension AublThemeContext on BuildContext {
  AublColors get aublColors => Theme.of(this).extension<AublColors>()!;
}

class AppTheme {
  const AppTheme._();

  static const Color navy950 = Color(0xFF061638);
  static const Color navy900 = Color(0xFF0A2457);
  static const Color navy800 = Color(0xFF123873);
  static const Color blue700 = Color(0xFF174F9D);
  static const Color blue600 = Color(0xFF2565BD);

  // 이전 화면을 위한 호환 색상. 새 화면은 AublColors의 의미 색상을 사용한다.
  static const Color slate900 = Color(0xFF07142B);
  static const Color slate800 = Color(0xFF0D203D);
  static const Color slate700 = Color(0xFF29476F);
  static const Color slate600 = Color(0xFF42628D);
  static const Color slate500 = Color(0xFF7F93AF);
  static const Color slate400 = Color(0xFFA8B8CF);
  static const Color slate300 = Color(0xFFD5E0EF);
  static const Color slate200 = Color(0xFFE4EBF5);
  static const Color slate100 = Color(0xFFF4F7FC);
  static const Color blue500 = blue600;
  static const Color blue400 = Color(0xFF6EA7F5);
  static const Color green500 = Color(0xFF13795B);
  static const Color red500 = Color(0xFFB4233C);
  static const Color orange500 = Color(0xFF9A5B05);
  static const Color yellow500 = Color(0xFFB7791F);
  static const Color amber400 = Color(0xFFD39B38);
  static const Color purple500 = blue700;
  static const Color indigo500 = navy800;

  static const AublColors lightColors = AublColors(
    canvas: Color(0xFFF4F7FC),
    surface: Color(0xFFFFFFFF),
    surfaceMuted: Color(0xFFEDF2F9),
    ink: Color(0xFF102854),
    muted: Color(0xFF62718C),
    line: Color(0xFFD8E1EE),
    lineStrong: Color(0xFFB9C8DD),
    navy: navy900,
    navyStrong: navy950,
    cobalt: blue600,
    focus: Color(0xFF2C70D0),
    success: Color(0xFF13795B),
    warning: Color(0xFF9A5B05),
    danger: Color(0xFFB4233C),
  );

  static const AublColors darkColors = AublColors(
    canvas: Color(0xFF07142B),
    surface: Color(0xFF0D203D),
    surfaceMuted: Color(0xFF132B4D),
    ink: Color(0xFFE7EEF9),
    muted: Color(0xFFA8B8CF),
    line: Color(0xFF29476F),
    lineStrong: Color(0xFF42628D),
    navy: Color(0xFFD8E7FF),
    navyStrong: Color(0xFFF3F7FF),
    cobalt: Color(0xFF6EA7F5),
    focus: Color(0xFF8AB9FF),
    success: Color(0xFF65D8AE),
    warning: Color(0xFFF3BD61),
    danger: Color(0xFFFF899B),
  );

  static ThemeData get light => _build(Brightness.light, lightColors);
  static ThemeData get dark => _build(Brightness.dark, darkColors);

  static ThemeData _build(Brightness brightness, AublColors colors) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: isDark ? const Color(0xFF285FA9) : navy900,
      onPrimary: Colors.white,
      secondary: isDark ? const Color(0xFF6EA7F5) : blue600,
      onSecondary: isDark ? navy950 : Colors.white,
      error: colors.danger,
      onError: isDark ? navy950 : Colors.white,
      surface: colors.surface,
      onSurface: colors.ink,
      outline: colors.line,
      outlineVariant: colors.lineStrong,
      surfaceContainerLowest: colors.surface,
      surfaceContainerLow: colors.surfaceMuted,
      surfaceContainer: colors.surfaceMuted,
      surfaceContainerHigh: colors.surfaceMuted,
      surfaceContainerHighest: colors.line,
    );
    final base = ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: scheme,
      scaffoldBackgroundColor: colors.canvas,
      fontFamily: 'Pretendard',
      extensions: [colors],
      visualDensity: VisualDensity.standard,
    );

    return base.copyWith(
      textTheme: base.textTheme
          .apply(bodyColor: colors.ink, displayColor: colors.ink)
          .copyWith(
            headlineLarge: TextStyle(
              color: colors.navyStrong,
              fontFamily: 'Pretendard',
              fontSize: 40,
              fontWeight: FontWeight.w900,
              letterSpacing: -1.8,
              height: 1.04,
            ),
            headlineMedium: TextStyle(
              color: colors.navyStrong,
              fontFamily: 'Pretendard',
              fontSize: 34,
              fontWeight: FontWeight.w900,
              letterSpacing: -1.35,
              height: 1.08,
            ),
            headlineSmall: TextStyle(
              color: colors.navyStrong,
              fontFamily: 'Pretendard',
              fontSize: 27,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.9,
              height: 1.12,
            ),
            titleLarge: TextStyle(
              color: colors.navyStrong,
              fontFamily: 'Pretendard',
              fontSize: 23,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.65,
              height: 1.16,
            ),
            titleMedium: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 17,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.25,
              height: 1.3,
            ),
            titleSmall: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.1,
              height: 1.35,
            ),
            bodyLarge: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 16,
              height: 1.65,
            ),
            bodyMedium: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 14,
              height: 1.6,
            ),
            bodySmall: TextStyle(
              color: colors.muted,
              fontFamily: 'Pretendard',
              fontSize: 12,
              height: 1.5,
            ),
            labelLarge: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 14,
              fontWeight: FontWeight.w800,
              letterSpacing: -0.1,
            ),
            labelMedium: TextStyle(
              color: colors.ink,
              fontFamily: 'Pretendard',
              fontSize: 12,
              fontWeight: FontWeight.w800,
              height: 1.3,
            ),
            labelSmall: TextStyle(
              color: colors.muted,
              fontFamily: 'Pretendard',
              fontSize: 11,
              fontWeight: FontWeight.w800,
              height: 1.2,
              letterSpacing: 0.4,
            ),
          ),
      appBarTheme: AppBarTheme(
        backgroundColor: colors.canvas,
        foregroundColor: colors.ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        systemOverlayStyle: systemUiStyleFor(brightness),
        titleTextStyle: TextStyle(
          color: colors.ink,
          fontFamily: 'Pretendard',
          fontSize: 20,
          fontWeight: FontWeight.w800,
        ),
      ),
      cardTheme: CardThemeData(
        color: colors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(4),
          side: BorderSide(color: colors.line),
        ),
      ),
      dividerTheme: DividerThemeData(color: colors.line, thickness: 1),
      iconTheme: IconThemeData(color: colors.muted),
      navigationBarTheme: NavigationBarThemeData(
        height: 68,
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: isDark
            ? const Color(0xFF1B3B66)
            : const Color(0xFFDCEAFE),
        indicatorShape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(6),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
          return TextStyle(
            color: states.contains(WidgetState.selected)
                ? colors.navy
                : colors.muted,
            fontSize: 10.5,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w800
                : FontWeight.w600,
          );
        }),
        iconTheme: WidgetStateProperty.resolveWith((states) {
          return IconThemeData(
            color: states.contains(WidgetState.selected)
                ? colors.navy
                : colors.muted,
            size: 22,
          );
        }),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: colors.surfaceMuted,
        selectedColor: isDark
            ? const Color(0xFF1B3B66)
            : const Color(0xFFDCEAFE),
        labelStyle: TextStyle(
          color: colors.ink,
          fontFamily: 'Pretendard',
          fontSize: 13,
        ),
        side: BorderSide(color: colors.line),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
      ),
      tabBarTheme: TabBarThemeData(
        labelColor: colors.navy,
        unselectedLabelColor: colors.muted,
        indicatorColor: colors.cobalt,
        dividerColor: colors.line,
        labelStyle: const TextStyle(
          fontFamily: 'Pretendard',
          fontWeight: FontWeight.w800,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colors.surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(4),
          borderSide: BorderSide(color: colors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(4),
          borderSide: BorderSide(color: colors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(4),
          borderSide: BorderSide(color: colors.focus, width: 2),
        ),
        hintStyle: TextStyle(color: colors.muted),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 14,
          vertical: 13,
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: isDark ? const Color(0xFF285FA9) : navy900,
          foregroundColor: Colors.white,
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(
            fontFamily: 'Pretendard',
            fontSize: 14,
            fontWeight: FontWeight.w800,
            height: 1.2,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: colors.navy,
          minimumSize: const Size(44, 44),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          side: BorderSide(color: colors.lineStrong),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          textStyle: const TextStyle(
            fontFamily: 'Pretendard',
            fontSize: 14,
            fontWeight: FontWeight.w800,
            height: 1.2,
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: colors.cobalt,
          minimumSize: const Size(44, 44),
          textStyle: const TextStyle(
            fontFamily: 'Pretendard',
            fontSize: 14,
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: ButtonStyle(
          minimumSize: const WidgetStatePropertyAll(Size(44, 44)),
          shape: WidgetStatePropertyAll(
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
          ),
          side: WidgetStatePropertyAll(BorderSide(color: colors.lineStrong)),
          textStyle: const WidgetStatePropertyAll(
            TextStyle(fontFamily: 'Pretendard', fontWeight: FontWeight.w800),
          ),
        ),
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(12)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: colors.surface,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: isDark ? const Color(0xFF285FA9) : navy900,
        foregroundColor: Colors.white,
        elevation: 2,
      ),
    );
  }

  static SystemUiOverlayStyle systemUiStyleFor(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    return SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
      statusBarBrightness: isDark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: isDark ? darkColors.canvas : lightColors.canvas,
      systemNavigationBarIconBrightness: isDark
          ? Brightness.light
          : Brightness.dark,
      systemNavigationBarDividerColor: Colors.transparent,
    );
  }

  static const SystemUiOverlayStyle systemUiStyle = SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: Color(0xFF07142B),
    systemNavigationBarIconBrightness: Brightness.light,
  );
}
