import 'dart:convert';

import '../../contracts/flutter_bridge_contract.dart';

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

      final typeRaw = decoded[FlutterBridgeContracts.typeKey];
      final tokenRaw = decoded[FlutterBridgeContracts.idTokenKey] ??
          decoded[FlutterBridgeContracts.legacyTokenKey];
      final idToken = tokenRaw is String ? tokenRaw : null;

      switch (typeRaw) {
        case FlutterBridgeContracts.loginSuccess:
          return FlutterBridgeMessage(
            type: BridgeMessageType.loginSuccess,
            idToken: idToken,
          );
        case FlutterBridgeContracts.tokenRefresh:
          return FlutterBridgeMessage(
            type: BridgeMessageType.tokenRefresh,
            idToken: idToken,
          );
        case FlutterBridgeContracts.logout:
          return FlutterBridgeMessage(type: BridgeMessageType.logout);
        case FlutterBridgeContracts.requestNativeGoogle:
          return FlutterBridgeMessage(
              type: BridgeMessageType.requestNativeGoogle);
        default:
          return FlutterBridgeMessage(type: BridgeMessageType.unknown);
      }
    } catch (_) {
      return FlutterBridgeMessage(type: BridgeMessageType.unknown);
    }
  }
}
