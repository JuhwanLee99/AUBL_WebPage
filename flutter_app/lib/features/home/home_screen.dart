import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../scorekeeper/scorekeeper_webview_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _checkingRole = true;
  bool _isAdmin = false;

  @override
  void initState() {
    super.initState();
    _refreshRole();
  }

  Future<void> _refreshRole() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) {
      if (!mounted) return;
      setState(() {
        _checkingRole = false;
        _isAdmin = false;
      });
      return;
    }

    try {
      final token = await user.getIdTokenResult(true);
      if (!mounted) return;
      final claims = token.claims;
      setState(() {
        _isAdmin = claims?['admin'] == true;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _isAdmin = false;
      });
    } finally {
      if (mounted) {
        setState(() {
          _checkingRole = false;
        });
      }
    }
  }

  Future<void> _logout() async {
    await FirebaseAuth.instance.signOut();
    await WebViewCookieManager().clearCookies();
  }

  @override
  Widget build(BuildContext context) {
    final user = FirebaseAuth.instance.currentUser;

    return Scaffold(
      appBar: AppBar(
        title: const Text('AUBL 앱'),
        actions: [
          IconButton(
            onPressed: _refreshRole,
            icon: const Icon(Icons.refresh),
            tooltip: '권한 새로고침',
          ),
          IconButton(
            onPressed: _logout,
            icon: const Icon(Icons.logout),
            tooltip: '로그아웃',
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('로그인 계정: ${user?.email ?? '-'}'),
            const SizedBox(height: 8),
            const Text('환경: ${AppConfig.environment}'),
            const SizedBox(height: 8),
            const Text('웹 베이스 URL: ${AppConfig.webBaseUrl}'),
            const SizedBox(height: 24),
            if (_checkingRole)
              const CircularProgressIndicator()
            else if (_isAdmin)
              ElevatedButton.icon(
                onPressed: () {
                  Navigator.of(context).push(
                    MaterialPageRoute<void>(
                      builder: (_) => const ScorekeeperWebViewScreen(isAdmin: true),
                    ),
                  );
                },
                icon: const Icon(Icons.fact_check),
                label: const Text('기록실 입장'),
              )
            else
              const Text(
                '관리자 권한이 확인되지 않아 기록실 버튼을 표시하지 않습니다.',
              ),
          ],
        ),
      ),
    );
  }
}
