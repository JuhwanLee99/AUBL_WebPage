import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../core/theme/app_theme.dart';
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
      home: const MainShell(),
    );
  }
}
