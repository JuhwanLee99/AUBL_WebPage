import 'package:cloud_firestore/cloud_firestore.dart';

class PlayerRegistrationPost {
  const PlayerRegistrationPost({
    required this.id,
    required this.title,
    required this.content,
    required this.author,
    required this.uid,
    required this.category,
    required this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String title;
  final String content;
  final String author;
  final String uid;
  final String category; // '선수 등록' | '유니폼 등록'
  final int createdAt;
  final int? updatedAt;

  static const categories = ['선수 등록', '유니폼 등록'];

  factory PlayerRegistrationPost.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final d = doc.data() ?? {};
    return PlayerRegistrationPost(
      id: doc.id,
      title: d['title'] as String? ?? '',
      content: d['content'] as String? ?? '',
      author: d['author'] as String? ?? '',
      uid: d['uid'] as String? ?? '',
      category: d['category'] as String? ?? '유니폼 등록',
      createdAt: d['createdAt'] as int? ?? 0,
      updatedAt: d['updatedAt'] as int?,
    );
  }

  Map<String, dynamic> toFirestore() => {
        'title': title,
        'content': content,
        'author': author,
        'uid': uid,
        'category': category,
        'createdAt': createdAt,
        if (updatedAt != null) 'updatedAt': updatedAt,
      };
}
