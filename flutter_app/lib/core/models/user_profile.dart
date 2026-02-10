import 'package:cloud_firestore/cloud_firestore.dart';

class UserProfile {
  const UserProfile({
    required this.uid,
    this.email,
    this.emailLower,
    this.displayName,
    this.createdAt,
    this.lastSignInAt,
    this.updatedAt,
  });

  final String uid;
  final String? email;
  final String? emailLower;
  final String? displayName;
  final String? createdAt;
  final String? lastSignInAt;
  final int? updatedAt;

  factory UserProfile.fromFirestore(
      DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return UserProfile(
      uid: doc.id,
      email: d['email'] as String?,
      emailLower: d['emailLower'] as String?,
      displayName: d['displayName'] as String?,
      createdAt: d['createdAt'] as String?,
      lastSignInAt: d['lastSignInAt'] as String?,
      updatedAt: d['updatedAt'] as int?,
    );
  }
}
