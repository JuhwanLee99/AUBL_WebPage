import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

enum ThemePreference {
  system,
  light,
  dark;

  String get label => switch (this) {
        system => '시스템 설정',
        light => '라이트',
        dark => '다크',
      };
}

class ThemeController extends ChangeNotifier {
  ThemeController(this._prefs)
      : _preference = _readPreference(_prefs.getString(_storageKey));

  static const _storageKey = 'aubl_theme_preference_v1';
  final SharedPreferences _prefs;
  ThemePreference _preference;

  ThemePreference get preference => _preference;
  ThemeMode get themeMode => switch (_preference) {
        ThemePreference.system => ThemeMode.system,
        ThemePreference.light => ThemeMode.light,
        ThemePreference.dark => ThemeMode.dark,
      };

  Future<void> setPreference(ThemePreference value) async {
    if (_preference == value) return;
    _preference = value;
    notifyListeners();
    await _prefs.setString(_storageKey, value.name);
  }

  static ThemePreference _readPreference(String? raw) {
    return ThemePreference.values.firstWhere(
      (value) => value.name == raw,
      orElse: () => ThemePreference.system,
    );
  }
}

class ThemeControllerScope extends InheritedNotifier<ThemeController> {
  const ThemeControllerScope({
    super.key,
    required ThemeController controller,
    required super.child,
  }) : super(notifier: controller);

  static ThemeController of(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<ThemeControllerScope>();
    assert(
        scope != null, 'ThemeControllerScope is missing above this context.');
    return scope!.notifier!;
  }
}
