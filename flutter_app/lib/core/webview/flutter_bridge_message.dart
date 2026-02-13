import 'dart:convert';

enum BridgeMessageType {
  loginSuccess,
  tokenRefresh,
  logout,
  requestNativeGoogle,
  unknown,
}

class FlutterBridgeMessage {
  FlutterBridgeMessage({
    required this.type,
    this.idToken,
  });

  final BridgeMessageType type;
  final String? idToken;

  static FlutterBridgeMessage fromRaw(String raw) {
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        return FlutterBridgeMessage(type: BridgeMessageType.unknown);
      }

      final typeRaw = decoded['type'];
      final tokenRaw = decoded['idToken'] ?? decoded['token'];
      final idToken = tokenRaw is String ? tokenRaw : null;

      switch (typeRaw) {
        case 'LOGIN_SUCCESS':
          return FlutterBridgeMessage(
            type: BridgeMessageType.loginSuccess,
            idToken: idToken,
          );
        case 'TOKEN_REFRESH':
          return FlutterBridgeMessage(
            type: BridgeMessageType.tokenRefresh,
            idToken: idToken,
          );
        case 'LOGOUT':
          return FlutterBridgeMessage(type: BridgeMessageType.logout);
        case 'REQUEST_NATIVE_GOOGLE':
          return FlutterBridgeMessage(type: BridgeMessageType.requestNativeGoogle);
        default:
          return FlutterBridgeMessage(type: BridgeMessageType.unknown);
      }
    } catch (_) {
      return FlutterBridgeMessage(type: BridgeMessageType.unknown);
    }
  }
}
