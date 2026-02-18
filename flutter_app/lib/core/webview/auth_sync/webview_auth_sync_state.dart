class WebViewAuthSyncState {
  String? _lastObservedUid;
  String? _lastInjectedUid;
  String? _lastInjectedAppIdToken;
  String? _lastConsumedWebIdToken;

  void setInitialObservedUid(String uid) {
    _lastObservedUid = uid;
  }

  bool shouldSkipObservedUid(String uid) {
    return _lastObservedUid == uid;
  }

  void markObservedUid(String uid) {
    if (_lastObservedUid != uid) {
      _lastInjectedAppIdToken = null;
    }
    _lastObservedUid = uid;
  }

  void clearObservedUid() {
    _lastObservedUid = null;
    _lastInjectedUid = null;
    _lastInjectedAppIdToken = null;
  }

  bool shouldSkipInjection({
    required String uid,
    required String idToken,
    String? redirectUrl,
  }) {
    if (redirectUrl != null) return false;
    return _lastInjectedUid == uid && _lastInjectedAppIdToken == idToken;
  }

  void markInjected({
    required String uid,
    required String idToken,
  }) {
    _lastInjectedUid = uid;
    _lastObservedUid = uid;
    _lastInjectedAppIdToken = idToken;
  }

  bool shouldSkipConsumedWebIdToken(String webIdToken) {
    return _lastConsumedWebIdToken == webIdToken;
  }

  void markConsumedWebIdToken(String webIdToken) {
    _lastConsumedWebIdToken = webIdToken;
  }

  void clearConsumedWebIdToken() {
    _lastConsumedWebIdToken = null;
  }

  void reset() {
    _lastObservedUid = null;
    _lastInjectedUid = null;
    _lastInjectedAppIdToken = null;
    _lastConsumedWebIdToken = null;
  }
}
