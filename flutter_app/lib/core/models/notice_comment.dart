import 'package:cloud_firestore/cloud_firestore.dart';

class NoticeComment {
  const NoticeComment({
    required this.id,
    required this.uid,
    required this.author,
    required this.content,
    required this.createdAt,
    this.parentId,
    this.likedBy = const [],
    this.likeCount = 0,
  });

  final String id;
  final String uid;
  final String author;
  final String content;
  final int createdAt;
  final String? parentId;
  final List<String> likedBy;
  final int likeCount;

  bool get isReply => parentId != null;

  factory NoticeComment.fromFirestore(
      DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    final rawLikedBy = d['likedBy'] as List<dynamic>?;

    return NoticeComment(
      id: doc.id,
      uid: d['uid'] as String? ?? '',
      author: d['author'] as String? ?? '',
      content: d['content'] as String? ?? '',
      createdAt: d['createdAt'] as int? ?? 0,
      parentId: d['parentId'] as String?,
      likedBy: rawLikedBy?.cast<String>() ?? const [],
      likeCount: d['likeCount'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toFirestore() {
    return {
      'uid': uid,
      'author': author,
      'content': content,
      'createdAt': createdAt,
      if (parentId != null) 'parentId': parentId,
      'likedBy': likedBy,
      'likeCount': likeCount,
    };
  }
}
