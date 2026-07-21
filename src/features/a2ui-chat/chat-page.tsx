"use client";

import { ProductNavigation } from "@/features/a2ui-core/product-navigation";
import { ChatbotPanel } from "./chatbot-panel";
import styles from "./chat.module.css";

export function ChatPage() {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span>A2</span>
          <div><strong>A2UI Chat</strong><small>Proxy Agent surface</small></div>
        </div>
        <ProductNavigation active="chat" />
        <div className={styles.status}><i /> Proxy connected</div>
      </header>

      <div className={styles.content}>
        <section className={styles.context} aria-label="Chatbot guide">
          <div className={styles.contextIndex}>01 / CONVERSATION</div>
          <div>
            <p className={styles.eyebrow}>Data to interface</p>
            <h1>질문하고,<br />답변 방식을 고르세요.</h1>
            <p className={styles.description}>
              A2UI 응답을 켜면 화면 형식을 제안하고, 끄면 조회 결과를 텍스트로 요약합니다.
            </p>
          </div>
          <dl className={styles.flowList}>
            <div><dt>01</dt><dd>질문 및 데이터 조회</dd></div>
            <div><dt>02</dt><dd>응답 모드 적용</dd></div>
            <div><dt>03</dt><dd>텍스트 또는 Surface 응답</dd></div>
          </dl>
          <p className={styles.hint}>예: “work-items API를 테이블로 보여줘”</p>
        </section>

        <section className={styles.chatMount} aria-label="Chatbot workspace">
          <ChatbotPanel height="calc(100vh - 88px)" resetKey={0} />
        </section>
      </div>
    </main>
  );
}
