import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';

import '../core/theme/app_theme.dart';
import '../features/auth/maintenance_screen.dart';

// ========================================
// 코드 레벨 비상 override (Firestore 장애 시)
// 평소에는 false — 실제 제어는 Firestore config/maintenance 문서로 합니다.
// ========================================
const _kMaintenanceFallback = false;
const _kResumeDateFallback = '';
const _kMessageFallback =
    '더 나은 서비스를 위해 시스템 개선 작업을 진행하고 있습니다.\n잠시만 기다려 주세요.\n\n문의: aublcau@gmail.com';

class MaintenanceGuard extends StatefulWidget {
  const MaintenanceGuard({super.key, required this.child});

  final Widget child;

  @override
  State<MaintenanceGuard> createState() => _MaintenanceGuardState();
}

class _MaintenanceGuardState extends State<MaintenanceGuard> {
  StreamSubscription<DocumentSnapshot>? _sub;

  bool _loading = true;
  bool _enabled = _kMaintenanceFallback;
  String _resumeDate = _kResumeDateFallback;
  String _message = _kMessageFallback;
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    _subscribeFirestore();
    _checkAdmin();
  }

  void _subscribeFirestore() {
    _sub = FirebaseFirestore.instance
        .collection('config')
        .doc('maintenance')
        .snapshots()
        .listen(
          (snap) {
            if (!mounted) return;
            if (snap.exists) {
              final data = snap.data() ?? {};
              setState(() {
                _enabled =
                    _kMaintenanceFallback || (data['enabled'] as bool? ?? false);
                _resumeDate =
                    (data['resumeDate'] as String?) ?? _kResumeDateFallback;
                _message = (data['message'] as String?) ?? _kMessageFallback;
                _loading = false;
              });
            } else {
              setState(() {
                _enabled = _kMaintenanceFallback;
                _resumeDate = _kResumeDateFallback;
                _message = _kMessageFallback;
                _loading = false;
              });
            }
          },
          onError: (_) {
            if (mounted) setState(() => _loading = false);
          },
        );
  }

  Future<void> _checkAdmin() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return;
    try {
      final token = await user.getIdTokenResult(true);
      if (mounted) {
        setState(() => _isAdmin = token.claims?['admin'] == true);
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const _LoadingScreen();
    }

    if (_enabled && !_isAdmin) {
      return MaintenanceScreen(
        resumeDate: _resumeDate,
        message: _message,
      );
    }

    return widget.child;
  }
}

class _LoadingScreen extends StatelessWidget {
  const _LoadingScreen();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppTheme.slate900,
      body: Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation<Color>(AppTheme.orange500),
          strokeWidth: 3,
        ),
      ),
    );
  }
}
