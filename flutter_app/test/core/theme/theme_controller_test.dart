import 'package:aubl_flutter_app/core/theme/theme_controller.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('defaults to system theme and persists an explicit override', () async {
    final prefs = await SharedPreferences.getInstance();
    final controller = ThemeController(prefs);

    expect(controller.preference, ThemePreference.system);
    expect(controller.themeMode, ThemeMode.system);

    await controller.setPreference(ThemePreference.dark);
    final restored = ThemeController(prefs);

    expect(restored.preference, ThemePreference.dark);
    expect(restored.themeMode, ThemeMode.dark);
  });
}
