import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/theme/app_theme.dart';
import '../core/theme/theme_controller.dart';
import '../features/feature_entries.dart';
import 'main_shell.dart';
import 'maintenance_guard.dart';

class AublApp extends StatefulWidget {
  const AublApp({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  State<AublApp> createState() => _AublAppState();
}

class _AublAppState extends State<AublApp> {
  late final ThemeController _themeController;

  @override
  void initState() {
    super.initState();
    _themeController = ThemeController(widget.prefs);
  }

  @override
  void dispose() {
    _themeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ThemeControllerScope(
      controller: _themeController,
      child: ListenableBuilder(
        listenable: _themeController,
        builder: (context, _) => MaterialApp(
          title: 'AUBL',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: _themeController.themeMode,
          themeAnimationDuration: const Duration(milliseconds: 220),
          localizationsDelegates: const [FlutterQuillLocalizations.delegate],
          builder: (context, child) {
            final theme = Theme.of(context);
            return AnnotatedRegion<SystemUiOverlayStyle>(
              value: AppTheme.systemUiStyleFor(theme.brightness),
              child: ColoredBox(
                color: theme.scaffoldBackgroundColor,
                child: child ?? const SizedBox.shrink(),
              ),
            );
          },
          home: AppGate(prefs: widget.prefs),
        ),
      ),
    );
  }
}

class AppGate extends StatefulWidget {
  const AppGate({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  State<AppGate> createState() => _AppGateState();
}

class _AppGateState extends State<AppGate> {
  late bool _onboardingSeen;

  @override
  void initState() {
    super.initState();
    _onboardingSeen = widget.prefs.getBool('onboarding_seen') ?? false;
  }

  void _onOnboardingComplete() async {
    await widget.prefs.setBool('onboarding_seen', true);
    setState(() => _onboardingSeen = true);
  }

  @override
  Widget build(BuildContext context) {
    if (!_onboardingSeen) {
      return OnboardingScreen(onComplete: _onOnboardingComplete);
    }
    return const MaintenanceGuard(child: MainShell());
  }
}
