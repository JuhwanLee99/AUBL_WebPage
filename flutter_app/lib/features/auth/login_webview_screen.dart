import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../../core/services/auth_bridge_service.dart';
import '../../core/webview/flutter_bridge_message.dart';

class LoginWebViewScreen extends StatefulWidget {
  const LoginWebViewScreen({
    super.key,
    this.nextPath,
  });

  final String? nextPath;

  @override
  State<LoginWebViewScreen> createState() => _LoginWebViewScreenState();
}

class _LoginWebViewScreenState extends State<LoginWebViewScreen> {
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  late final WebViewController _controller;

  bool _pageLoading = true;
  bool _authenticating = false;
  String? _error;

  @override
  void initState() {
    super.initState();

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        'FlutterBridge',
        onMessageReceived: (message) {
          _onBridgeMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            if (!mounted) return;
            setState(() {
              _pageLoading = true;
            });
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() {
              _pageLoading = false;
            });
          },
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              _pageLoading = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
        ),
      )
      ..loadRequest(_loginUri());
  }

  @override
  void dispose() {
    _authBridgeService.dispose();
    super.dispose();
  }

  Uri _loginUri() {
    final query = <String, String>{'embedded': 'flutter'};
    if (widget.nextPath != null && widget.nextPath!.startsWith('/')) {
      query['next'] = widget.nextPath!;
    }
    return AppConfig.webUri('/login', queryParameters: query);
  }

  Future<void> _onBridgeMessage(String raw) async {
    final payload = FlutterBridgeMessage.fromRaw(raw);

    switch (payload.type) {
      case BridgeMessageType.loginSuccess:
      case BridgeMessageType.tokenRefresh:
        final idToken = payload.idToken;
        if (idToken != null && idToken.isNotEmpty) {
          await _signInWithCustomToken(idToken);
        }
        return;
      case BridgeMessageType.logout:
        await FirebaseAuth.instance.signOut();
        return;
      case BridgeMessageType.unknown:
        return;
    }
  }

  Future<void> _signInWithCustomToken(String webIdToken) async {
    if (_authenticating) return;

    setState(() {
      _authenticating = true;
      _error = null;
    });

    try {
      final customToken = await _authBridgeService.exchangeWebIdToken(webIdToken);
      await FirebaseAuth.instance.signInWithCustomToken(customToken);
      if (!mounted) return;
      setState(() {
        _error = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '네이티브 로그인 동기화 실패: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _authenticating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AUBL 로그인'),
      ),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_pageLoading || _authenticating)
            const Center(
              child: CircularProgressIndicator(),
            ),
          if (_error != null)
            Align(
              alignment: Alignment.bottomCenter,
              child: Container(
                width: double.infinity,
                margin: const EdgeInsets.all(12),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: Colors.red.shade700,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Text(
                  _error!,
                  style: const TextStyle(color: Colors.white),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
