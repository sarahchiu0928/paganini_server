import express from 'express'
const router = express.Router()
// 資料庫連線
import sequelize from '#configs/db.js'
// 身分驗證
import authenticate from '#middlewares/authenticate.js'

// GET - 取得會員的優惠券資料
router.get('/', authenticate, async function (req, res) {
  const userId = req.user.id
  const today = new Date().toISOString().split('T')[0]; // 取得今天的日期，格式為 YYYY-MM-DD
  
  try {
    // 更新過期的優惠券狀態為 4
    await sequelize.query(`
      UPDATE member_coupon
      SET status = 4
      WHERE ((expiration_date < CURRENT_DATE OR coupon_id IN (
        SELECT id FROM coupon WHERE end_date < CURRENT_DATE AND end_date != '0000-00-00'
       ))) AND status != 4 AND status != 3 AND user_id = ?
    `, {
      replacements: [userId]
    });

    const memberCoupons = await sequelize.query(
    `
    SELECT
    mc.id AS member_coupon_id,
    mc.coupon_id,
    mc.user_id,
    mc.status,
    mc.claimed_at,
    mc.expiration_date,
    mc.used_at,
    c.id AS coupon_id,
    c.sid,
    c.name,
    c.info,
    c.type,
    c.value,
    c.min_price,
    c.max_price,
    c.start_date,
    c.end_date,
    c.object
FROM
    member_coupon mc
JOIN coupon c ON
    mc.coupon_id = c.id
WHERE
    mc.user_id = :userId;
`,
{
  replacements: { userId },
  type: sequelize.QueryTypes.SELECT,
})

if (!userId) {
  return res.status(400).json({ status: 'error', message: '缺少會員ID' })
}

// 標準回傳 JSON
return res.json({ status: 'success', data: memberCoupons })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得會員優惠券資料' })
  }
})

// POST - 新增會員的優惠券資料
router.post('/', authenticate, async function (req, res) {
  try {
    const userId = req.user.id
    const { couponId } = req.body

    if (!userId || !couponId) {
      return res.status(400).json({ status: 'error', message: '缺少會員ID或優惠券ID' })
    }

    // 檢查會員是否已經擁有該優惠券
    const [existingCoupons] = await sequelize.query(`
      SELECT * FROM member_coupon WHERE user_id = ? AND coupon_id = ?
    `, {
      replacements: [userId, couponId]
    })

    if (existingCoupons.length > 0) {
      return res.status(400).json({ status: 'error', message: '您已經領取過此優惠券' })
    }

    // 設置優惠券的狀態和時間
    const status = 2; // 已領取
    const claimedAt = new Date();

    // 使用原生 SQL 新增會員的優惠券資料
    await sequelize.query(`
      INSERT INTO member_coupon (user_id, coupon_id, status, claimed_at) VALUES (?, ?, ?, ?)
    `, {
      replacements: [userId, couponId, status, claimedAt],
      // type: sequelize.QueryTypes.SELECT,
    })

    // 標準回傳 JSON
    return res.json({ status: 'success', message: '優惠券已成功領取' })
  } catch (error) {
    console.error('無法新增會員優惠券資料:', error)
    return res.status(500).json({ status: 'error', message: '無法新增會員優惠券資料' })
  }
})

// POST - 搜尋優惠券代碼
router.post('/search', authenticate, async function (req, res) {
  try {
    const userId = req.user.id;
    const { code } = req.body;

     // 檢查是否接收到前端的資料
     console.log("收到的 userId:", userId);
     console.log("收到的優惠券代碼 code:", code);

    if (!code || !userId) {
      return res.status(400).json({ status: 'error', message: '缺少優惠券代碼或取得用戶ID資訊' });
    }

    // 檢查優惠券是否存在於 coupon 資料表中
    const [coupon] = await sequelize.query(`
      SELECT * FROM coupon WHERE sid = ?
    `, {
      
      replacements: [code]
    });
    console.log(coupon)

    if (coupon.length === 0) {
      return res.status(404).json({ status: 'error', message: '優惠券不存在' });
    }

    // 檢查會員是否已經擁有該優惠券
    const [existingCoupons] = await sequelize.query(`
      SELECT * FROM member_coupon WHERE user_id = ? AND coupon_id = ?
    `, {
      replacements: [userId, coupon[0].id]
    });

    if (existingCoupons.length > 0) {
      return res.status(400).json({ status: 'duplicate', message: '您已經領取過此優惠券' });
    }

    // 如果用戶還沒有領取過此優惠券，則新增領取紀錄
    await sequelize.query(`
      INSERT INTO member_coupon (user_id, coupon_id, status, claimed_at) VALUES (?, ?, 2, NOW())
    `, {
      replacements: [userId, coupon[0].id]
    });

    return res.status(200).json({ status: 'success', message: '領取成功',coupon: coupon[0] });
  } catch (error) {
    console.error('搜尋優惠券代碼失敗:', error);
    return res.status(500).json({ status: 'error', message: '搜尋優惠券代碼失敗' });
  }
});
  


    

export default router