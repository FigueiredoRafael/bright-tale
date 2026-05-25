-- M-015 extension: notification_templates table.
-- Stores pt-BR text templates for every notification type.
-- notify() fetches and interpolates these when title is not explicitly provided.

CREATE TABLE IF NOT EXISTS public.notification_templates (
  type                 text        PRIMARY KEY,
  label                text        NOT NULL,
  title_template       text        NOT NULL,
  body_template        text,
  default_action_url   text,
  available_variables  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  is_system            boolean     NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER handle_updated_at BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

ALTER TABLE public.notification_templates ENABLE ROW LEVEL SECURITY;
-- No direct client access; service_role only via API routes.

-- Seed all 9 existing notification types with pt-BR templates.
INSERT INTO public.notification_templates
  (type, label, title_template, body_template, default_action_url, available_variables)
VALUES
  ('donation_received',
   'Doação recebida',
   'Você recebeu {amount} tokens!',
   'Motivo: {reason}',
   '/settings/usage',
   '["userName","amount","reason"]'),

  ('donation_pending_approval',
   'Doação aguardando aprovação',
   'Aprovação pendente: {amount} tokens para {recipientName}',
   'Motivo: {reason}',
   '/admin/donations',
   '["amount","recipientName","reason"]'),

  ('tokens_reset',
   'Tokens resetados',
   'Seus tokens foram zerados',
   'Seus créditos de uso foram resetados. Em caso de dúvidas, entre em contato.',
   '/settings/usage',
   '["userName"]'),

  ('plan_low',
   'Plano quase esgotado',
   'Você usou {percent}% do seu plano',
   'Seus tokens estão acabando. Considere fazer upgrade para continuar criando conteúdo.',
   '/settings/plan',
   '["userName","percent"]'),

  ('plan_renewed',
   'Plano renovado',
   'Plano {planName} renovado com sucesso!',
   'Seus tokens foram recarregados. Bora criar!',
   '/settings/plan',
   '["userName","planName"]'),

  ('job_done',
   'Tarefa concluída',
   '{jobName} concluído!',
   'Seu conteúdo está pronto para revisão.',
   '/projects',
   '["userName","jobName"]'),

  ('announcement',
   'Anúncio',
   '{title}',
   '{body}',
   null,
   '["title","body"]'),

  ('coupon_redeemed',
   'Cupom resgatado',
   'Cupom {couponCode} aplicado!',
   '{amount} tokens adicionados à sua conta.',
   '/settings/usage',
   '["userName","couponCode","amount"]'),

  ('security',
   'Alerta de segurança',
   'Alerta de segurança na sua conta',
   '{action}',
   '/settings/security',
   '["userName","action"]')

ON CONFLICT (type) DO NOTHING;
