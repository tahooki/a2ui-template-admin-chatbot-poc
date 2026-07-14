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
            <h1>질문하고,<br />보는 방식을 선택하세요.</h1>
            <p className={styles.description}>
              Proxy Agent가 Main Agent의 조회 데이터와 메타데이터를 받아 최대 세 가지 A2UI 표시 방식을 제안합니다.
            </p>
          </div>
          <dl className={styles.flowList}>
            <div><dt>01</dt><dd>질문 및 데이터 조회</dd></div>
            <div><dt>02</dt><dd>표시 방식 추천</dd></div>
            <div><dt>03</dt><dd>선택한 Surface 생성</dd></div>
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
