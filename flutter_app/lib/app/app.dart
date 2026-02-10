import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/theme/app_theme.dart';
import '../features/onboarding/onboarding_screen.dart';
import 'main_shell.dart';

class AublApp extends StatelessWidget {
  const AublApp({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AUBL',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      builder: (context, child) {
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: AppTheme.systemUiStyle,
          child: Container(
            color: AppTheme.slate900,
            child: child ?? const SizedBox.shrink(),
          ),
        );
      },
      home: AppGate(prefs: prefs),
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
    return const MainShell();
  }
}
