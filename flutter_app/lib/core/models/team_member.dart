import 'package:cloud_firestore/cloud_firestore.dart';

class TeamMember {
  const TeamMember({
    required this.uid,
    required this.name,
    this.role = 'player',
    this.number,
    this.position,
    this.bats,
    this.throws_,
    this.profileImageUrl,
    this.profileBio,
    this.joinedAt,
    this.status = 'active',
  });

  final String uid;
  final String name;
  final String role; // player | staff | coach
  final String? number;
  final String? position;
  final String? bats; // R | L | S
  final String? throws_; // R | L
  final String? profileImageUrl;
  final String? profileBio;
  final int? joinedAt;
  final String status; // active | inactive

  bool get isCoach => role == 'coach';
  bool get isStaff => role == 'staff';
  bool get isPlayer => role == 'player';

  factory TeamMember.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return TeamMember(
      uid: doc.id,
      name: d['name'] as String? ?? '',
      role: d['role'] as String? ?? 'player',
      number: d['number'] as String?,
      position: d['position'] as String?,
      bats: d['bats'] as String?,
      throws_: d['throws'] as String?,
      profileImageUrl: d['profileImageUrl'] as String?,
      profileBio: d['profileBio'] as String?,
      joinedAt: d['joinedAt'] as int?,
      status: d['status'] as String? ?? 'active',
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'name': name,
      'role': role,
      if (number != null) 'number': number,
      if (position != null) 'position': position,
      if (bats != null) 'bats': bats,
      if (throws_ != null) 'throws': throws_,
      if (profileImageUrl != null) 'profileImageUrl': profileImageUrl,
      if (profileBio != null) 'profileBio': profileBio,
      if (joinedAt != null) 'joinedAt': joinedAt,
      'status': status,
    };
  }
}
