import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../core/theme/app_theme.dart';
import '../features/feature_entries.dart';
import 'main_shell.dart';
import 'maintenance_guard.dart';

class AublApp extends StatelessWidget {
  const AublApp({super.key, required this.prefs});

  final SharedPreferences prefs;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AUBL',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.dark,
      localizationsDelegates: const [FlutterQuillLocalizations.delegate],
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
    return const MaintenanceGuard(child: MainShell());
  }
}
