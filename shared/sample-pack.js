// 프로젝트 팩 샘플 (실제로는 팀 공유 JSON). 모든 값은 가상의 예시입니다.
self.ENV_PACKS = [
  {
    project: "주문 관리 시스템",
    // 운영 도메인 패턴: 팩에 섞여 들어와도 무시하고, 해당 도메인에서는 아무것도 보여주지 않음
    prodPatterns: ["^order\\.company\\.example$", "^admin\\.company\\.example$"],
    envs: [
      {
        type: "dev",
        url: "http://localhost:8080",
        accounts: [
          { id: "dev_admin", memo: "관리자 화면 테스트용" },
          { id: "dev_user01", memo: "일반 사용자 시나리오" }
        ]
      },
      {
        type: "test",
        url: "https://order-test.company.example",
        accounts: [
          { id: "qa_admin", memo: "QA 관리자" },
          { id: "qa_user01", memo: "QA 일반 사용자" },
          { id: "qa_readonly", memo: "조회 전용 확인용" }
        ]
      }
    ]
  },
  {
    project: "회원 포털",
    prodPatterns: ["^member\\.company\\.example$"],
    envs: [
      {
        type: "dev",
        url: "http://localhost:3000",
        accounts: [{ id: "portal_dev01", memo: "개발 기본 계정" }]
      },
      {
        type: "test",
        url: "https://member-test.company.example",
        accounts: [
          { id: "portal_qa01", memo: "가입 직후 상태" },
          { id: "portal_qa_vip", memo: "VIP 등급 계정" }
        ]
      },
      // 실수로 운영 URL이 들어간 경우 → 검증에서 걸러지는지 데모
      {
        type: "test",
        url: "https://member.company.example",
        accounts: [{ id: "should_not_show", memo: "운영 URL은 표시되면 안 됨" }]
      }
    ]
  }
];
