import 'package:cloud_firestore/cloud_firestore.dart';

class TeamNotice {
  const TeamNotice({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    this.createdByUid,
    this.createdByName,
    this.category = '일반',
    this.pinned = false,
  });

  final String id;
  final String title;
  final String content;
  final int createdAt;
  final String? createdByUid;
  final String? createdByName;
  final String category; // 일반 | 훈련 | 경기 | 긴급
  final bool pinned;

  factory TeamNotice.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return TeamNotice(
      id: doc.id,
      title: d['title'] as String? ?? '',
      content: d['content'] as String? ?? '',
      createdAt: d['createdAt'] as int? ?? 0,
      createdByUid: d['createdByUid'] as String?,
      createdByName: d['createdByName'] as String?,
      category: d['category'] as String? ?? '일반',
      pinned: d['pinned'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'title': title,
      'content': content,
      'createdAt': createdAt,
      if (createdByUid != null) 'createdByUid': createdByUid,
      if (createdByName != null) 'createdByName': createdByName,
      'category': category,
      'pinned': pinned,
    };
  }
}
