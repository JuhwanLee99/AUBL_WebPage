import 'package:webview_flutter/webview_flutter.dart';

import '../../config/app_config.dart';
import '../../contracts/web_contracts.dart';

class LoginNavigationResolution {
  const LoginNavigationResolution({
    this.fallbackUri,
    this.pendingRedirectUrl,
  });

  final Uri? fallbackUri;
  final String? pendingRedirectUrl;
}

class WebViewNavigationGuard {
  const WebViewNavigationGuard._();

  static bool shouldIgnoreWebError(WebResourceError error) {
    final desc = error.description.toLowerCase();
    return desc.contains('err_failed') || desc.contains('err_aborted');
  }

  static bool shouldRetryFailedNavigation(
    WebResourceError error, {
    required bool hasRetried,
  }) {
    if (hasRetried) return false;
    final desc = error.description.toLowerCase();
    return desc.contains('err_failed');
  }

  static bool isAppleOAuthRequest(Uri uri) {
    final host = uri.host.toLowerCase();
    if (host.contains('appleid.apple.com')) return true;
    final providerId = uri.queryParameters['providerId'];
    if (providerId == 'apple.com' && uri.path.contains('/__/auth/handler')) {
      return true;
    }
    return false;
  }

  static bool isGoogleOAuthRequest(Uri uri) {
    final host = uri.host.toLowerCase();
    if (host.contains('accounts.google.com') ||
        host.contains('oauth2.googleapis.com')) {
      return true;
    }
    final providerId = uri.queryParameters['providerId'];
    if (providerId == 'google.com' && uri.path.contains('/__/auth/handler')) {
      return true;
    }
    return false;
  }

  static Uri buildEmbeddedLoginFallbackUri({
    required String defaultNextPath,
    String? requestedNextPath,
  }) {
    final nextPath = requestedNextPath ?? defaultNextPath;
    return AppConfig.webUri(
      WebRouteContracts.login,
      queryParameters: WebQueryContracts.embeddedParams(nextPath: nextPath),
    );
  }

  static LoginNavigationResolution resolveLoginNavigation({
    required Uri uri,
    required String webHost,
    required String defaultNextPath,
    required bool hasCurrentUser,
  }) {
    final isSameHost = uri.host.isEmpty || uri.host == webHost;
    if (!isSameHost || uri.path != WebRouteContracts.login) {
      return const LoginNavigationResolution();
    }

    final alreadyEmbedded = uri.queryParameters[WebQueryContracts.embedded] ==
        WebQueryContracts.embeddedFlutter;
    final nativeGoogleEnabled =
        uri.queryParameters[WebQueryContracts.nativeGoogle] ==
            WebQueryContracts.enabled;

    if (!alreadyEmbedded || !nativeGoogleEnabled) {
      return LoginNavigationResolution(
        fallbackUri: buildEmbeddedLoginFallbackUri(
          defaultNextPath: defaultNextPath,
          requestedNextPath: uri.queryParameters[WebQueryContracts.next],
        ),
      );
    }

    if (!hasCurrentUser) {
      return const LoginNavigationResolution();
    }

    final next = uri.queryParameters[WebQueryContracts.next] ?? defaultNextPath;
    return LoginNavigationResolution(
      pendingRedirectUrl: AppConfig.webUri(
        next,
        queryParameters: WebQueryContracts.embeddedParams(),
      ).toString(),
    );
  }
}
