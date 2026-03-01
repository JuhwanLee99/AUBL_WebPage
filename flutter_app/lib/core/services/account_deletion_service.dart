import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:crypto/crypto.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';

enum AccountDeletionProvider {
  password,
  google,
  apple,
  unknown,
}

class AccountDeletionException implements Exception {
  AccountDeletionException(this.message);

  final String message;

  @override
  String toString() => message;
}

class AccountDeletionResult {
  const AccountDeletionResult({
    required this.uid,
    required this.provider,
  });

  final String uid;
  final AccountDeletionProvider provider;
}

class AccountDeletionService {
  AccountDeletionService({
    FirebaseAuth? auth,
    FirebaseFirestore? firestore,
  })  : _auth = auth ?? FirebaseAuth.instance,
        _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseAuth _auth;
  final FirebaseFirestore _firestore;

  Future<AccountDeletionResult> deleteCurrentUser({
    String? currentPassword,
  }) async {
    final user = _auth.currentUser;
    if (user == null) {
      throw AccountDeletionException('로그인된 계정을 찾을 수 없습니다.');
    }

    final provider = _resolveProvider(user);
    await _reauthenticate(
      user,
      provider: provider,
      currentPassword: currentPassword,
    );
    await _deleteUserDocuments(user.uid);
    await user.delete();

    return AccountDeletionResult(
      uid: user.uid,
      provider: provider,
    );
  }

  AccountDeletionProvider resolveCurrentProvider(User user) {
    return _resolveProvider(user);
  }

  Future<void> _reauthenticate(
    User user, {
    required AccountDeletionProvider provider,
    String? currentPassword,
  }) async {
    switch (provider) {
      case AccountDeletionProvider.password:
        final email = user.email;
        if (email == null || email.isEmpty) {
          throw AccountDeletionException('이메일 정보를 찾을 수 없습니다.');
        }
        if (currentPassword == null || currentPassword.isEmpty) {
          throw AccountDeletionException('계정 삭제를 위해 비밀번호를 입력해 주세요.');
        }
        final credential = EmailAuthProvider.credential(
          email: email,
          password: currentPassword,
        );
        await user.reauthenticateWithCredential(credential);
        return;
      case AccountDeletionProvider.google:
        late final GoogleSignInAccount account;
        try {
          account = await GoogleSignIn.instance.authenticate();
        } on GoogleSignInException catch (e) {
          if (e.code == GoogleSignInExceptionCode.canceled) {
            throw AccountDeletionException('Google 재인증이 취소되었습니다.');
          }
          rethrow;
        }
        final authData = account.authentication;
        final idToken = authData.idToken;
        if (idToken == null || idToken.isEmpty) {
          throw AccountDeletionException('Google idToken을 가져오지 못했습니다.');
        }
        final credential = GoogleAuthProvider.credential(idToken: idToken);
        await user.reauthenticateWithCredential(credential);
        return;
      case AccountDeletionProvider.apple:
        if (!Platform.isIOS) {
          throw AccountDeletionException('Apple 재인증은 iOS에서만 지원됩니다.');
        }
        final rawNonce = _generateNonce();
        final credential = await SignInWithApple.getAppleIDCredential(
          scopes: const <AppleIDAuthorizationScopes>[
            AppleIDAuthorizationScopes.email,
            AppleIDAuthorizationScopes.fullName,
          ],
          nonce: _sha256Of(rawNonce),
        );
        final idToken = credential.identityToken;
        if (idToken == null || idToken.isEmpty) {
          throw AccountDeletionException('Apple identity token을 가져오지 못했습니다.');
        }
        final oauth = AppleAuthProvider.credentialWithIDToken(
          idToken,
          rawNonce,
          AppleFullPersonName(
            givenName: credential.givenName,
            familyName: credential.familyName,
          ),
        );
        await user.reauthenticateWithCredential(oauth);
        return;
      case AccountDeletionProvider.unknown:
        await user.reload();
        return;
    }
  }

  AccountDeletionProvider _resolveProvider(User user) {
    final providerIds = user.providerData
        .map((p) => p.providerId)
        .where((id) => id.isNotEmpty && id != 'firebase')
        .toSet();

    if (providerIds.contains('apple.com')) return AccountDeletionProvider.apple;
    if (providerIds.contains('google.com')) {
      return AccountDeletionProvider.google;
    }
    if (providerIds.contains('password')) {
      return AccountDeletionProvider.password;
    }
    return AccountDeletionProvider.unknown;
  }

  Future<void> _deleteUserDocuments(String uid) async {
    final batch = _firestore.batch();
    batch.delete(_firestore.collection('users').doc(uid));
    batch.delete(_firestore.collection('roles').doc(uid));

    final memberRefs = await _findMembershipRefs(uid);
    for (final ref in memberRefs) {
      batch.delete(ref);
    }

    await batch.commit();
  }

  Future<List<DocumentReference<Map<String, dynamic>>>> _findMembershipRefs(
      String uid) async {
    final refs = <DocumentReference<Map<String, dynamic>>>[];
    try {
      final byUid = await _firestore
          .collectionGroup('members')
          .where('uid', isEqualTo: uid)
          .get();
      refs.addAll(byUid.docs.map((d) => d.reference));
    } catch (_) {}

    if (refs.isNotEmpty) return refs;

    try {
      // iOS에서 collectionGroup + documentId 동등 비교는 런타임 예외가 날 수 있어
      // teams/*/members/{uid} 직접 조회로 fallback 한다.
      final teams = await _firestore.collection('teams').get();
      for (final team in teams.docs) {
        final ref = team.reference.collection('members').doc(uid);
        final memberDoc = await ref.get();
        if (!memberDoc.exists) continue;
        refs.add(ref);
      }
    } catch (_) {}
    return refs;
  }

  String _generateNonce([int length = 32]) {
    const charset =
        '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';
    final random = Random.secure();
    return List<String>.generate(
      length,
      (_) => charset[random.nextInt(charset.length)],
    ).join();
  }

  String _sha256Of(String input) {
    final bytes = utf8.encode(input);
    return sha256.convert(bytes).toString();
  }
}
