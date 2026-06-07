// 统一工单表：普通工单与封禁申诉共用同一套处理和回复链路。
exports.up = async function (knex) {
  const hasTickets = await knex.schema.hasTable('tickets');
  if (!hasTickets) {
    await knex.schema.createTable('tickets', (t) => {
      t.increments('id').unsigned().primary();
      t.integer('user_id').unsigned().notNullable().comment('提交用户ID');
      t.enu('type', ['general', 'appeal']).notNullable().defaultTo('general').comment('工单类型');
      t.string('title', 120).notNullable().comment('工单标题');
      t.text('content').notNullable().comment('首条工单内容');
      t.enu('status', ['open', 'answered', 'resolved', 'closed']).notNullable().defaultTo('open').comment('处理状态');
      t.enu('priority', ['low', 'normal', 'high', 'urgent']).notNullable().defaultTo('normal').comment('优先级');
      t.enu('source_type', ['appeal', 'manual']).nullable().comment('来源类型');
      t.integer('source_id').unsigned().nullable().comment('来源记录ID');
      t.json('ai_result').nullable().comment('AI处理结果');
      t.timestamp('closed_at').nullable().comment('关闭时间');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      t.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
      t.index(['user_id', 'status']);
      t.index(['type', 'status']);
      t.index('updated_at');
      t.unique(['source_type', 'source_id']);
    });
  }

  const hasReplies = await knex.schema.hasTable('ticket_replies');
  if (!hasReplies) {
    await knex.schema.createTable('ticket_replies', (t) => {
      t.increments('id').unsigned().primary();
      t.integer('ticket_id').unsigned().notNullable().comment('工单ID');
      t.integer('sender_id').unsigned().nullable().comment('发送人ID，系统/AI可为空');
      t.enu('sender_type', ['user', 'admin', 'ai', 'system']).notNullable().comment('发送人类型');
      t.text('content').notNullable().comment('回复内容');
      t.boolean('is_ai').notNullable().defaultTo(false).comment('是否为AI生成内容');
      t.timestamp('notification_sent_at').nullable().comment('站内信通知发送时间');
      t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      t.foreign('ticket_id').references('id').inTable('tickets').onDelete('CASCADE');
      t.foreign('sender_id').references('id').inTable('users').onDelete('SET NULL');
      t.index(['ticket_id', 'created_at']);
      t.index('notification_sent_at');
    });
  }

  const hasAppealTicketId = await knex.schema.hasColumn('user_appeals', 'ticket_id');
  if (!hasAppealTicketId) {
    await knex.schema.alterTable('user_appeals', (t) => {
      t.integer('ticket_id').unsigned().nullable().unique().comment('关联工单ID');
      t.foreign('ticket_id').references('id').inTable('tickets').onDelete('SET NULL');
    });
  }

  const appeals = await knex('user_appeals')
    .select('*')
    .whereNull('ticket_id')
    .orderBy('created_at', 'asc');

  for (const appeal of appeals) {
    const isPending = appeal.status === 'pending';
    const [ticketId] = await knex('tickets').insert({
      user_id: appeal.user_id,
      type: 'appeal',
      title: `封禁申诉 #${appeal.id}`,
      content: appeal.content,
      status: isPending ? 'open' : 'resolved',
      priority: 'normal',
      source_type: 'appeal',
      source_id: appeal.id,
      ai_result: appeal.ai_result || null,
      closed_at: isPending ? null : (appeal.updated_at || knex.fn.now()),
      created_at: appeal.created_at,
      updated_at: appeal.updated_at,
    });

    await knex('ticket_replies').insert({
      ticket_id: ticketId,
      sender_id: appeal.user_id,
      sender_type: 'user',
      content: appeal.content,
      is_ai: false,
      created_at: appeal.created_at,
    });

    if (!isPending && appeal.review_note) {
      await knex('ticket_replies').insert({
        ticket_id: ticketId,
        sender_id: appeal.reviewed_by || null,
        sender_type: appeal.reviewed_by ? 'admin' : 'system',
        content: appeal.review_note,
        is_ai: !appeal.reviewed_by,
        created_at: appeal.updated_at || appeal.created_at,
      });
    }

    await knex('user_appeals').where({ id: appeal.id }).update({ ticket_id: ticketId });
  }
};

exports.down = async function (knex) {
  const hasAppealTicketId = await knex.schema.hasColumn('user_appeals', 'ticket_id');
  if (hasAppealTicketId) {
    await knex.schema.alterTable('user_appeals', (t) => {
      t.dropForeign(['ticket_id']);
      t.dropUnique(['ticket_id']);
      t.dropColumn('ticket_id');
    });
  }

  await knex.schema.dropTableIfExists('ticket_replies');
  await knex.schema.dropTableIfExists('tickets');
};
