const { Router } = require("express");

module.exports = function createAdminRouter(deps) {
  const { supabase, supabaseAdmin, requireUser, requireAdmin, logAdminAction, publicProduct, adminLimiter } = deps;
  const router = Router();

  /* ── Metrics (no pagination) ─────────────────── */

  router.get("/admin/metrics", adminLimiter, requireUser, requireAdmin, async (_req, res) => {
    try {
      const { data: all } = await supabaseAdmin.auth.admin.listUsers();
      const { count: productCount } = await supabase.from("products").select("*", { count: "exact", head: true }).catch(() => ({ count: 0 }));
      const { count: saleCount } = await supabase.from("sales").select("*", { count: "exact", head: true }).catch(() => ({ count: 0 }));
      res.json({
        users: all.users.length,
        products: productCount || 0,
        sales: saleCount || 0
      });
    } catch (error) {
      console.error("[admin/metrics]", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Users (page-based pagination) ───────────── */

  router.get("/admin/users", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const perPage = Math.min(50, Math.max(1, parseInt(req.query.per_page) || 20));

      const { data: all, error } = await supabaseAdmin.auth.admin.listUsers({
        page,
        perPage
      });

      if (error) return res.status(500).json({ error: "Error al listar usuarios." });

      const total = all?.total || 0;
      const totalPages = Math.ceil(total / perPage);
      const users = (all?.users || []).map(u => {
        const m = u.user_metadata || {};
        return {
          id: u.id,
          email: u.email,
          dealer_id: m.dealer_id,
          username: m.username || m.dealer_id,
          avatar: m.avatar || "avatar-1",
          banned: Boolean(m.banned),
          is_admin: Boolean(m.is_admin),
          created_at: u.created_at
        };
      });

      res.json({
        users,
        page,
        per_page: perPage,
        total,
        total_pages: totalPages,
        next_page: page < totalPages ? page + 1 : null
      });
    } catch (error) {
      console.error("[admin/users]", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Products (cursor-based pagination) ──────── */

  router.get("/admin/products", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const cursor = req.query.cursor || null;
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
      const includeAll = req.query.all === "true";

      let query = supabase
        .from("products")
        .select("*", { count: "exact", head: includeAll ? false : true });

      if (!includeAll) {
        query = supabase
          .from("products")
          .select("*");
      }

      if (cursor) {
        query = query.lt("created_at", cursor);
      }

      const { data: rows, error, count } = await query
        .order("created_at", { ascending: false })
        .limit(limit + 1).catch(() => ({ data: [], error: null, count: 0 }));

      if (error) return res.json({ products: [], nextCursor: null, hasMore: false, total: 0 });

      const hasMore = rows.length > limit;
      const products = (hasMore ? rows.slice(0, limit) : rows).map(row => {
        const base = publicProduct(row) || {};
        return { ...base, seller_name: "", seller_email: "" };
      });

      const nextCursor = hasMore ? rows[limit - 1]?.created_at : null;

      const sellerIds = [...new Set(products.map(p => p.user_id).filter(Boolean))];
      if (sellerIds.length > 0) {
        for (const uid of sellerIds) {
          try {
            const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(uid);
            if (user) {
              const m = user.user_metadata || {};
              const name = m.username || m.dealer_id || "";
              const email = user.email || "";
              for (const p of products) {
                if (String(p.user_id) === String(uid)) {
                  p.seller_name = name;
                  p.seller_email = email;
                  p.seller_username = name;
                }
              }
            }
          } catch {}
        }
      }

      res.json({
        products,
        next_cursor: nextCursor,
        total: count || null,
        has_more: hasMore
      });
    } catch (error) {
      console.error("[admin/products]", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Sales (cursor-based pagination) ─────────── */

  router.get("/admin/sales", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const cursor = req.query.cursor || null;
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

      let query = supabase
        .from("sales")
        .select("*, product:products(*), buyer:buyer_id(id, username, avatar), seller:seller_id(id, username, avatar)")
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (cursor) query = query.lt("created_at", cursor);

      const { data: rows, error } = await query.catch(() => ({ data: [], error: null }));

      if (error) return res.json({ sales: [], next_cursor: null, total: 0, has_more: false });

      const hasMore = rows.length > limit;
      const sales = (hasMore ? rows.slice(0, limit) : rows);
      const nextCursor = hasMore ? rows[limit - 1]?.created_at : null;

      res.json({
        sales,
        next_cursor: nextCursor,
        has_more: hasMore
      });
    } catch (error) {
      console.error("[admin/sales]", error);
      res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Sales verification ─────────────────────── */

  router.post("/admin/sales/:id/verify", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const { data: sale } = await supabase.from("sales").select("*").eq("id", req.params.id).single();
      if (!sale) return res.status(404).json({ error: "Venta no encontrada." });
      if (sale.status !== "requested" && sale.status !== "external") return res.status(400).json({ error: "Solo se pueden verificar ventas requested o external." });

      await supabaseAdmin.from("sales").update({
        status: "completed", verified: true, verified_by: req.user.id,
        verified_at: new Date().toISOString(), completed_at: new Date().toISOString()
      }).eq("id", sale.id);

      await supabaseAdmin.from("products").update({ status: "sold" }).eq("id", sale.product_id);

      const points = sale.type === "internal" ? 50 : 5;
      await supabaseAdmin.from("reputation_events").insert({
        user_id: sale.seller_id, sale_id: sale.id,
        event_type: sale.type === "internal" ? "sale_verified" : "sale_external", points
      }).catch(() => {});

      if (sale.type === "internal") {
        await supabaseAdmin.rpc("exec_sql", {
          sql: `UPDATE profiles SET reputation_score = COALESCE(reputation_score,0) + ${points}, sales_verified = COALESCE(sales_verified,0) + 1 WHERE id = '${sale.seller_id}'`
        }).catch(() => {});
      }

      await logAdminAction(req.user.id, `verify_sale_${sale.type}`, sale.id, req);
      res.json({ ok: true });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  router.post("/admin/sales/:id/reject", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const { data: sale } = await supabase.from("sales").select("*").eq("id", req.params.id).single();
      if (!sale) return res.status(404).json({ error: "Venta no encontrada." });

      await supabaseAdmin.from("sales").update({ status: "rejected" }).eq("id", sale.id);
      await supabaseAdmin.from("products").update({ status: "disponible" }).eq("id", sale.product_id);
      await logAdminAction(req.user.id, "reject_sale", sale.id, req);
      res.json({ ok: true });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Reports paginated ──────────────────────── */

  router.get("/admin/reports", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const cursor = req.query.cursor || null;
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));

      const fetchQuery = supabase
        .from("reports")
        .select("*, reporter:reporter_id(id, username), reported:reported_user_id(id, username)");

      if (cursor) {
        fetchQuery.lt("created_at", cursor);
      }

      const { data: rows, error } = await fetchQuery
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      if (error) return res.status(500).json({ error: "Error al listar reportes." });

      const hasMore = rows.length > limit;
      const reports = (hasMore ? rows.slice(0, limit) : rows);
      const nextCursor = hasMore ? rows[limit - 1]?.created_at : null;

      res.json({
        reports,
        next_cursor: nextCursor,
        has_more: hasMore
      });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  router.post("/admin/reports/:id/action", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      const { action } = req.body || {};
      if (!action || !["dismissed", "action_taken"].includes(action)) {
        return res.status(400).json({ error: "Accion invalida." });
      }
      const { data: report } = await supabase.from("reports").select("*").eq("id", req.params.id).single();
      if (!report) return res.status(404).json({ error: "Reporte no encontrado." });

      await supabaseAdmin.from("reports").update({
        status: action === "action_taken" ? "action_taken" : "dismissed",
        admin_id: req.user.id,
        admin_note: req.body.note || "",
        resolved_at: new Date().toISOString()
      }).eq("id", report.id);

      if (action === "action_taken") {
        await supabaseAdmin.from("reputation_events").insert({
          user_id: report.reported_user_id,
          event_type: "report_confirmed",
          points: -30,
          reference_id: report.id
        }).catch(() => {});
        await supabaseAdmin.rpc("exec_sql", {
          sql: `UPDATE profiles SET reputation_score = COALESCE(reputation_score,0) - 30, reports_count = COALESCE(reports_count,0) + 1 WHERE id = '${report.reported_user_id}'`
        }).catch(() => {});
      }

      if (typeof logAdminAction === "function") {
        await logAdminAction(req.user.id, `report_${action}`, report.id, req);
      }
      res.json({ ok: true });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Ban user ─────────────────────────────── */

  router.post("/admin/users/:id/ban", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: "No puedes bannearte a ti mismo." });
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado." });
      const meta = user.user_metadata || {};
      const nowBanned = !meta.banned;
      await supabaseAdmin.auth.admin.updateUserById(req.params.id, { user_metadata: { ...meta, banned: nowBanned } });
      if (nowBanned) {
        await supabaseAdmin.auth.admin.signOut(req.params.id).catch(() => {});
        await supabaseAdmin.from("products").update({ status: "hidden" }).eq("user_id", req.params.id).catch(() => {});
      } else {
        await supabaseAdmin.from("products").update({ status: "disponible" }).eq("user_id", req.params.id).catch(() => {});
      }
      await logAdminAction(req.user.id, nowBanned ? "ban" : "unban", req.params.id, req);
      res.json({ ok: true, banned: nowBanned });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  /* ── Delete user ──────────────────────────── */

  router.delete("/admin/users/:id", adminLimiter, requireUser, requireAdmin, async (req, res) => {
    try {
      if (String(req.params.id) === String(req.user.id)) return res.status(400).json({ error: "No puedes eliminar tu propia cuenta admin." });
      await supabaseAdmin.from("products").delete().eq("user_id", req.params.id);
      const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
      if (error) return res.status(500).json({ error: "Error al eliminar usuario." });
      await logAdminAction(req.user.id, "delete_user", req.params.id, req);
      res.json({ ok: true });
    } catch (error) {
      console.error(error); res.status(500).json({ error: "Error interno del servidor." });
    }
  });

  return router;
};
