class FlutterBridgeContracts {
  const FlutterBridgeContracts._();

  static const String channelName = 'FlutterBridge';

  static const String typeKey = 'type';
  static const String idTokenKey = 'idToken';
  static const String legacyTokenKey = 'token';

  static const String loginSuccess = 'LOGIN_SUCCESS';
  static const String tokenRefresh = 'TOKEN_REFRESH';
  static const String logout = 'LOGOUT';
  static const String requestNativeGoogle = 'REQUEST_NATIVE_GOOGLE';

  static const String authInjectFunction = '__flutterAuthInject';
  static const String getIdTokenFunction = '__flutterGetIdToken';
}
