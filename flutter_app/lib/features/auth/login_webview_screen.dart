import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../../core/config/app_config.dart';
import '../../core/contracts/flutter_bridge_contract.dart';
import '../../core/contracts/web_contracts.dart';
import '../../core/services/auth_bridge_service.dart';
import '../../core/webview/auth_sync/webview_auth_scripts.dart';
import '../../core/webview/auth_sync/webview_auth_sync_controller.dart';
import '../../core/webview/auth_sync/webview_auth_sync_state.dart';
import '../../core/webview/navigation/webview_navigation_guard.dart';

class LoginWebViewScreen extends StatefulWidget {
  const LoginWebViewScreen({
    super.key,
    this.nextPath,
  });

  final String? nextPath;

  @override
  State<LoginWebViewScreen> createState() => _LoginWebViewScreenState();
}

class _LoginWebViewScreenState extends State<LoginWebViewScreen>
    with WidgetsBindingObserver {
  static const Color _chromeColor = Color(0xFF0F172A);
  static const SystemUiOverlayStyle _overlayStyle = SystemUiOverlayStyle(
    statusBarIconBrightness: Brightness.light,
    statusBarBrightness: Brightness.dark,
    systemNavigationBarIconBrightness: Brightness.light,
  );
  final AuthBridgeService _authBridgeService = AuthBridgeService();
  late final WebViewController _controller;
  StreamSubscription<User?>? _authSub;
  bool _loginCompleted = false;
  final WebViewAuthSyncState _authSyncState = WebViewAuthSyncState();

  bool _pageLoading = true;
  bool _authenticating = false;
  bool _googleSigningIn = false;
  bool _appleSigningIn = false;
  bool _retriedErrFailed = false;
  String? _error;

  bool get _isIosAppleNativeEnabled =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.iOS;

  void _applySystemUiChrome() {
    unawaited(SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge));
    SystemChrome.setSystemUIOverlayStyle(_overlayStyle);
  }

  void _finishLogin() {
    if (_loginCompleted) return;
    _loginCompleted = true;
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  bool _isGoogleOAuthRequest(Uri uri) {
    final host = uri.host.toLowerCase();
    final isGoogleHost = host.contains('accounts.google.com') ||
        host.contains('oauth2.googleapis.com');
    if (isGoogleHost) return true;

    // Firebase Auth redirect handler for Google provider.
    final providerId = uri.queryParameters['providerId'];
    if (providerId == 'google.com' && uri.path.contains('/__/auth/handler')) {
      return true;
    }

    return false;
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _applySystemUiChrome();

    if (FirebaseAuth.instance.currentUser != null) {
      // 이미 로그인 상태면 바로 닫기
      WidgetsBinding.instance.addPostFrameCallback((_) => _finishLogin());
    } else {
      _authSub = FirebaseAuth.instance.authStateChanges().listen((user) {
        if (user != null) _finishLogin();
      });
    }

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
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri != null && _isGoogleOAuthRequest(uri)) {
              if (!_googleSigningIn) {
                unawaited(_signInWithNativeGoogle());
              }
              return NavigationDecision.prevent;
            }
            if (uri != null &&
                WebViewNavigationGuard.isAppleOAuthRequest(uri)) {
              if (!_isIosAppleNativeEnabled) {
                return NavigationDecision.navigate;
              }
              if (!_appleSigningIn) {
                unawaited(_signInWithNativeApple());
              }
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onPageStarted: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _pageLoading = true;
            });
          },
          onPageFinished: (_) {
            _applySystemUiChrome();
            if (!mounted) return;
            setState(() {
              _pageLoading = false;
            });
            unawaited(_requestWebIdTokenIfNeeded());
          },
          onWebResourceError: (error) {
            if (WebViewNavigationGuard.shouldRetryFailedNavigation(
              error,
              hasRetried: _retriedErrFailed,
            )) {
              _retriedErrFailed = true;
              unawaited(_controller.reload());
              return;
            }
            if (WebViewNavigationGuard.shouldIgnoreWebError(error)) return;
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
    WidgetsBinding.instance.removeObserver(this);
    _authSub?.cancel();
    _authBridgeService.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _applySystemUiChrome();
    }
  }

  Uri _loginUri() {
    return AppConfig.webUri(
      WebRouteContracts.login,
      queryParameters: WebQueryContracts.embeddedParams(
        nextPath: widget.nextPath,
        includeForceLogout: true,
      ),
    );
  }

  Future<void> _requestWebIdTokenIfNeeded() async {
    if (_authenticating) return;
    if (FirebaseAuth.instance.currentUser != null) return;
    final uri = _loginUri();
    if (uri.queryParameters[WebQueryContracts.forceLogout] ==
        WebQueryContracts.enabled) {
      return;
    }
    try {
      await _controller.runJavaScript(WebViewAuthScripts.probeWebIdToken);
    } catch (_) {}
  }

  Future<void> _onBridgeMessage(String raw) async {
    await WebViewAuthSyncController.handleBridgeMessage(
      rawMessage: raw,
      onWebToken: _signInWithCustomToken,
      onLogout: () async {
        _authSyncState.clearConsumedWebIdToken();
        await FirebaseAuth.instance.signOut();
      },
      onRequestNativeGoogle: _signInWithNativeGoogle,
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
      _finishLogin();
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

  Future<void> _signInWithNativeGoogle() async {
    if (_googleSigningIn || _authenticating) return;

    setState(() {
      _googleSigningIn = true;
      _error = null;
    });

    try {
      final account = await GoogleSignIn.instance.authenticate();
      final authData = account.authentication;
      final idToken = authData.idToken;
      if (idToken == null || idToken.isEmpty) {
        throw Exception('Google idToken을 가져오지 못했습니다.');
      }
      final credential = GoogleAuthProvider.credential(
        idToken: idToken,
      );
      await FirebaseAuth.instance.signInWithCredential(credential);
      _finishLogin();
    } on GoogleSignInException catch (e) {
      debugPrint(
          'Google native auth failed: code=${e.code}, msg=${e.description}');
      if (e.code == GoogleSignInExceptionCode.canceled) return;
      if (!mounted) return;
      setState(() {
        _error = 'Google 로그인 실패: $e';
      });
    } catch (e) {
      debugPrint('Google native auth failed: $e');
      if (!mounted) return;
      setState(() {
        _error = 'Google 로그인 실패: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _googleSigningIn = false;
        });
      }
    }
  }

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  String _sha256ofString(String input) {
    final bytes = utf8.encode(input);
    return sha256.convert(bytes).toString();
  }

  Map<String, dynamic> _decodeJwtClaims(String jwt) {
    final parts = jwt.split('.');
    if (parts.length < 2) return const <String, dynamic>{};
    try {
      final payload =
          utf8.decode(base64Url.decode(base64Url.normalize(parts[1])));
      final decoded = jsonDecode(payload);
      if (decoded is Map<String, dynamic>) return decoded;
      if (decoded is Map) {
        return decoded.map(
          (key, value) => MapEntry(key.toString(), value),
        );
      }
    } catch (_) {}
    return const <String, dynamic>{};
  }

  Future<void> _signInWithNativeApple() async {
    if (_appleSigningIn || _authenticating) return;
    if (!_isIosAppleNativeEnabled) return;

    setState(() {
      _appleSigningIn = true;
      _error = null;
    });

    Map<String, dynamic> claims = const <String, dynamic>{};
    String? expectedNonce;

    try {
      final rawNonce = _generateNonce();
      final nonce = _sha256ofString(rawNonce);
      expectedNonce = nonce;
      final credential = await SignInWithApple.getAppleIDCredential(
        scopes: const [
          AppleIDAuthorizationScopes.email,
          AppleIDAuthorizationScopes.fullName,
        ],
        nonce: nonce,
      );
      final identityToken = credential.identityToken;
      if (identityToken == null || identityToken.isEmpty) {
        throw Exception('Apple identity token이 없습니다.');
      }
      claims = _decodeJwtClaims(identityToken);
      final tokenNonce = claims['nonce']?.toString();
      if (tokenNonce != null && tokenNonce.isNotEmpty && tokenNonce != nonce) {
        throw Exception('Apple nonce 검증 실패');
      }
      final oauthCredential = AppleAuthProvider.credentialWithIDToken(
        identityToken,
        rawNonce,
        AppleFullPersonName(
          givenName: credential.givenName,
          familyName: credential.familyName,
        ),
      );
      await FirebaseAuth.instance.signInWithCredential(oauthCredential);
      _finishLogin();
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) return;
      if (!mounted) return;
      setState(() {
        _error = 'Apple 로그인 실패: $e';
      });
    } on FirebaseAuthException catch (e) {
      debugPrint(
        'Apple native auth failed: code=${e.code}, msg=${e.message}, '
        'aud=${claims['aud']}, iss=${claims['iss']}, tokenNonce=${claims['nonce']}, expectedNonce=$expectedNonce',
      );
      if (!mounted) return;
      setState(() {
        _error = 'Apple 로그인 실패: $e';
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = 'Apple 로그인 실패: $e';
      });
    } finally {
      if (mounted) {
        setState(() {
          _appleSigningIn = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: _chromeColor,
      body: AnnotatedRegion<SystemUiOverlayStyle>(
        value: _overlayStyle,
        child: SafeArea(
          child: Stack(
            children: [
              WebViewWidget(controller: _controller),
              if (_pageLoading ||
                  _authenticating ||
                  _googleSigningIn ||
                  _appleSigningIn)
                Container(
                  color: _chromeColor,
                  child: const Center(child: CircularProgressIndicator()),
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
        ),
      ),
    );
  }
}
