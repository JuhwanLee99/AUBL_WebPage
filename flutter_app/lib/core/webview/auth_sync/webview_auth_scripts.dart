import '../../contracts/flutter_bridge_contract.dart';

class WebViewAuthScripts {
  const WebViewAuthScripts._();

  static const String probeWebIdToken = '''
(async () => {
  try {
    const getter = window.${FlutterBridgeContracts.getIdTokenFunction};
    const bridge = window.${FlutterBridgeContracts.channelName};
    if (!getter || !bridge) return;
    const token = await getter();
    if (token) {
      bridge.postMessage(JSON.stringify({
        ${FlutterBridgeContracts.typeKey}: '${FlutterBridgeContracts.tokenRefresh}',
        ${FlutterBridgeContracts.idTokenKey}: token
      }));
    }
  } catch (_) {}
})();
''';

  static String buildInjectCustomToken({
    required String customToken,
    String? redirectUrl,
  }) {
    final escapedToken =
        customToken.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
    final escapedRedirect =
        redirectUrl?.replaceAll(r'\', r'\\').replaceAll("'", r"\'");
    final redirectExpr =
        escapedRedirect == null ? 'null' : "'$escapedRedirect'";

    return '''
(function() {
  const token = '$escapedToken';
  const redirect = $redirectExpr;
  const inject = () => {
    if (window.${FlutterBridgeContracts.authInjectFunction}) {
      const result = window.${FlutterBridgeContracts.authInjectFunction}(token);
      if (redirect) {
        Promise.resolve(result)
          .then(() => window.location.replace(redirect))
          .catch(() => {});
      }
      return true;
    }
    return false;
  };
  if (inject()) return;
  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (inject() || tries >= 20) {
      clearInterval(timer);
    }
  }, 300);
})();
''';
  }
}
