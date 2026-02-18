import 'package:cloud_firestore/cloud_firestore.dart';

class InquiryPost {
  const InquiryPost({
    required this.id,
    required this.title,
    required this.content,
    required this.author,
    required this.uid,
    required this.platform,
    required this.category,
    required this.isPrivate,
    required this.status,
    required this.createdAt,
    this.updatedAt,
  });

  final String id;
  final String title;
  final String content;
  final String author;
  final String uid;
  final String platform; // 'app' | 'web'
  final String category; // '기능 개선' | '버그 신고' | '사용 문의' | '기타'
  final bool isPrivate;
  final String status; // '미처리' | '처리 중' | '처리 완료'
  final int createdAt;
  final int? updatedAt;

  static const statuses = ['미처리', '처리 중', '처리 완료'];

  factory InquiryPost.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return InquiryPost(
      id: doc.id,
      title: d['title'] as String? ?? '',
      content: d['content'] as String? ?? '',
      author: d['author'] as String? ?? '',
      uid: d['uid'] as String? ?? '',
      platform: d['platform'] as String? ?? 'app',
      category: d['category'] as String? ?? '기타',
      isPrivate: d['isPrivate'] as bool? ?? false,
      status: d['status'] as String? ?? '미처리',
      createdAt: d['createdAt'] as int? ?? 0,
      updatedAt: d['updatedAt'] as int?,
    );
  }

  Map<String, dynamic> toFirestore() => {
        'title': title,
        'content': content,
        'author': author,
        'uid': uid,
        'platform': platform,
        'category': category,
        'isPrivate': isPrivate,
        'status': status,
        'createdAt': createdAt,
        if (updatedAt != null) 'updatedAt': updatedAt,
      };
}

class InquiryComment {
  const InquiryComment({
    required this.id,
    required this.content,
    required this.author,
    required this.uid,
    required this.createdAt,
  });

  final String id;
  final String content;
  final String author;
  final String uid;
  final int createdAt;

  factory InquiryComment.fromFirestore(DocumentSnapshot<Map<String, dynamic>> doc) {
    final d = doc.data() ?? {};
    return InquiryComment(
      id: doc.id,
      content: d['content'] as String? ?? '',
      author: d['author'] as String? ?? '',
      uid: d['uid'] as String? ?? '',
      createdAt: d['createdAt'] as int? ?? 0,
    );
  }

  Map<String, dynamic> toFirestore() => {
        'content': content,
        'author': author,
        'uid': uid,
        'createdAt': createdAt,
      };
}
