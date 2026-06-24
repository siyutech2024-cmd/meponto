export const metadata = { title: "Exclusão de conta | Account deletion | MePonto" };

export default function AccountDeletionPage() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px", lineHeight: 1.7, fontFamily: "Arial, sans-serif" }}>
      <h1>Exclusão de conta e dados — MePonto</h1>
      <p>Última atualização: 24 de junho de 2026</p>

      {/* ---------- Português ---------- */}
      <h2>Como solicitar a exclusão (Português)</h2>
      <p>
        Para solicitar a exclusão da sua conta MePonto (entregador parceiro / membro) e dos dados associados,
        envie um e-mail para <strong>siyutech2024@gmail.com</strong> com o assunto
        &quot;Exclusão de conta&quot;, informando o telefone cadastrado e/ou o CPF vinculado à conta.
        Concluímos a exclusão em até 30 dias e confirmamos por e-mail.
      </p>
      <p>
        <strong>Dados excluídos:</strong> nome, telefone, CPF, chave PIX, data de nascimento, identificador de
        entregador parceiro (ID 99), histórico de turnos, pontos acumulados, resgates e tokens de notificação.
      </p>
      <p>
        <strong>Dados retidos:</strong> registros financeiros e fiscais (repasses, resgates) podem ser mantidos
        de forma anonimizada pelo prazo exigido pela legislação brasileira aplicável, sem vínculo com a sua identidade.
      </p>

      {/* ---------- English ---------- */}
      <h2>How to request deletion (English)</h2>
      <p>
        To request deletion of your MePonto account (partner rider / member) and associated data, email
        <strong> siyutech2024@gmail.com</strong> with the subject &quot;Account deletion&quot;, including the phone
        number and/or CPF linked to the account. Deletion is completed within 30 days and confirmed by email.
      </p>
      <p>
        <strong>Data deleted:</strong> name, phone number, CPF, PIX key, date of birth, partner rider ID (99 ID),
        shift history, accumulated points, redemptions and notification tokens.
      </p>
      <p>
        <strong>Data retained:</strong> financial and tax records (payouts, redemptions) may be kept in anonymized
        form for the period required by applicable Brazilian law, with no link to your identity.
      </p>

      {/* ---------- 中文 ---------- */}
      <h2>如何申请删除(中文)</h2>
      <p>
        如需删除您的 MePonto 账户(骑手 / 会员)及相关数据,请发送邮件至
        <strong> siyutech2024@gmail.com</strong>,主题为&quot;账户删除&quot;,并提供与账户绑定的手机号和/或 CPF。
        我们将在 30 天内完成删除并通过邮件确认。
      </p>
      <p>
        <strong>将删除的数据:</strong>姓名、手机号、CPF、PIX 收款信息、出生日期、骑手编号(99 ID)、班次记录、积分、兑换记录与推送 token。
      </p>
      <p>
        <strong>将保留的数据:</strong>财务与税务记录(结算、兑换)可能按巴西适用法律要求以匿名化形式保留相应期限,且不再与您的身份关联。
      </p>
    </main>
  );
}
