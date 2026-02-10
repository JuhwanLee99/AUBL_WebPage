import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';
import '../features/auth/login_webview_screen.dart';
import 'main_shell.dart';

class AublApp extends StatelessWidget {
  const AublApp({super.key});

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
      home: const _AuthGate(),
    );
  }
}

class _AuthGate extends StatelessWidget {
  const _AuthGate();

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }

        if (snapshot.data == null) {
          return const LoginWebViewScreen();
        }

        return const MainShell();
      },
    );
  }
}
