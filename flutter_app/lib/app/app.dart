import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../features/auth/login_webview_screen.dart';
import '../features/home/home_screen.dart';

class AublApp extends StatelessWidget {
  const AublApp({super.key});

  static const Color _chromeColor = Color(0xFF0F172A);
  static const SystemUiOverlayStyle _systemUiStyle = SystemUiOverlayStyle(
    statusBarColor: _chromeColor,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: _chromeColor,
    systemNavigationBarIconBrightness: Brightness.light,
    systemNavigationBarDividerColor: _chromeColor,
  );

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'AUBL',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0F172A)),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          backgroundColor: _chromeColor,
          foregroundColor: Colors.white,
          systemOverlayStyle: _systemUiStyle,
        ),
      ),
      builder: (context, child) {
        return AnnotatedRegion<SystemUiOverlayStyle>(
          value: _systemUiStyle,
          child: Container(
            color: _chromeColor,
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

        return const HomeScreen();
      },
    );
  }
}
