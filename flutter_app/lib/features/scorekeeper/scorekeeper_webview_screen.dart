import 'dart:async';

import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../../core/contracts/flutter_bridge_contract.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/services/auth_session_service.dart';
import '../../core/services/auth_bridge_service.dart';
import '../../core/webview/auth_sync/webview_auth_sync_controller.dart';
import '../../core/webview/auth_sync/webview_auth_sync_state.dart';

class ScorekeeperWebViewScreen extends StatefulWidget {
  const ScorekeeperWebViewScreen({
    super.key,
    required this.isAdmin,
  });

  final bool isAdmin;

  @override
  State<ScorekeeperWebViewScreen> createState() =>
      _ScorekeeperWebViewScreenState();
}

class _ScorekeeperWebViewScreenState extends State<ScorekeeperWebViewScreen> {
  static const Color _chromeColor = Color(0xFF0F172A);
  static const SystemUiOverlayStyle _overlayStyle = SystemUiOverlayStyle(
    statusBarColor: _chromeColor,
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarColor: _chromeColor,
    systemNavigationBarIconBrightness: Brightness.light,
    systemNavigationBarDividerColor: _chromeColor,
  );

  final AuthBridgeService _authBridgeService = AuthBridgeService();
  late final WebViewController _controller;
  final WebViewAuthSyncState _authSyncState = WebViewAuthSyncState();

  bool _loading = true;
  bool _authenticating = false;
  bool _redirectedToFallbackLogin = false;
  String? _error;

  void _applySystemUiChrome() {
    unawaited(SystemChrome.setEnabledSystemUIMode(
      SystemUiMode.manual,
      overlays: SystemUiOverlay.values,
    ));
    SystemChrome.setSystemUIOverlayStyle(_overlayStyle);
  }

  Uri get _scorekeeperUri => AppConfig.webUri(WebRouteContracts.scorekeeper);

  Uri get _loginFallbackUri => AppConfig.webUri(
        WebRouteContracts.login,
        queryParameters: WebQueryContracts.embeddedParams(
          nextPath: WebRouteContracts.scorekeeper,
        ),
      );

  @override
  void initState() {
    super.initState();
    _applySystemUiChrome();

    _controller = WebViewController()
      ..setBackgroundColor(_chromeColor)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..addJavaScriptChannel(
        FlutterBridgeContracts.channelName,
        onMessageReceived: (message) {
          _onBridgeMessage(message.message);
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _loading = true;
            });
          },
          onPageFinished: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _loading = false;
            });
          },
          onWebResourceError: (error) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _error = '웹 로딩 실패: ${error.description}';
            });
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.navigate;

            final webHost = Uri.parse(AppConfig.webBaseUrl).host;
            final isSameHost = uri.host.isEmpty || uri.host == webHost;
            final isLoginRoute = uri.path == WebRouteContracts.login;

            if (isSameHost && isLoginRoute && !_redirectedToFallbackLogin) {
              _redirectedToFallbackLogin = true;
              _controller.loadRequest(_loginFallbackUri);
              return NavigationDecision.prevent;
            }

            return NavigationDecision.navigate;
          },
        ),
      )
      ..loadRequest(_scorekeeperUri);
  }

  @override
  void dispose() {
    _authBridgeService.dispose();
    super.dispose();
  }

  Future<void> _onBridgeMessage(String raw) async {
    await WebViewAuthSyncController.handleBridgeMessage(
      rawMessage: raw,
      onWebToken: _signInWithCustomToken,
      onLogout: () async {
        _authSyncState.clearConsumedWebIdToken();
        await AuthSessionService.signOutFast(clearWebViewCookies: false);
      },
      onRequestNativeGoogle: () async {},
    );
  }

  Future<void> _signInWithCustomToken(String webIdToken) async {
    if (_authSyncState.shouldSkipConsumedWebIdToken(webIdToken)) return;
    if (_authenticating) return;

    setState(() {
      _authenticating = true;
      _error = null;
    });

    try {
      await WebViewAuthSyncController.signInWithWebToken(
        webIdToken: webIdToken,
        auth: FirebaseAuth.instance,
        authBridgeService: _authBridgeService,
        syncState: _authSyncState,
      );
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
    if (!widget.isAdmin) {
      return Scaffold(
        appBar: AppBar(title: const Text('기록실')),
        body: const Center(
          child: Text('관리자 권한이 없어 기록실에 접근할 수 없습니다.'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('기록실')),
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_loading || _authenticating)
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
