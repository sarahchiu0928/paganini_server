import express from 'express'
const router = express.Router()

// 資料庫使用，使用原本的 mysql2 + sql
import db from '##/configs/mysql.js'

import jsonwebtoken from 'jsonwebtoken'
// 中介軟體，存取隱私會員資料用
import authenticate from '#middlewares/authenticate.js'

// 定義安全的私鑰字串
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET

// GET - 得到單筆資料(注意，有動態參數時要寫在 GET 區段最後面)
router.get('/', authenticate, async function (req, res) {
  const id = req.user.id

  // 檢查是否為授權會員，只有授權會員可以存取自己的資料
  if (req.user.id !== id) {
    return res.json({ status: 'error', message: '存取會員資料失敗' })
  }

  const [rows] = await db.query('SELECT * FROM user WHERE ID = ?', [id])

  if (rows.length === 0) {
    return res.json({ status: 'error', message: '沒有找到會員資料' })
  }

  const user = rows[0]

  // 不回傳密碼
  delete user.password

  return res.json({ status: 'success', data: { user } })
})

router.get('/:id', authenticate, async function (req, res) {
  const id = Number(req.params.id)

  // 檢查是否為授權會員，只有授權會員可以存取自己的資料
  if (!id) {
    return res.json({ status: 'error', message: '存取會員資料失敗' })
  }

  const [rows] = await db.query('SELECT * FROM user WHERE ID = ?', [id])

  if (rows.length === 0) {
    return res.json({ status: 'error', message: '沒有找到會員資料' })
  }

  const user = rows[0]
  // 確保 gender 欄位存在，並提供一個默認值
  if (!user.gender) {
    user.gender = '未指定'; // 或根據需求設置默認值
  }

  // 不回傳密碼
  delete user.password

  return res.json({ status: 'success', data: { user } })
})

// 會員註冊
router.post('/', async (req, res, next) => {
  console.log(req.body)

  const newUser = req.body

  // 檢查是否有重覆的 email 或 account
  const [rows] = await db.query(
    'SELECT * FROM user WHERE email = ? OR account = ?',
    [newUser.email, newUser.account]
  )

  if (rows.length > 0) {
    return res.json({ status: 'error', message: '有重覆的 email 或帳號' })
  }

  // 直接使用明文密碼
  const [rows2] = await db.query(
    'INSERT INTO `user`(`member_name`, `account`, `password`, `email`, `gender`, `phone`, `birthdate`, `address`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      newUser.member_name,
      newUser.account,
      newUser.password, // 使用明文密碼
      newUser.email,
      newUser.gender,
      newUser.phone,
      newUser.birthdate,
      newUser.address,
    ]
  )

  // 檢查是否有產生 insertId，代表新增成功
  if (rows2.insertId) {
    const userId = rows2.insertId

    // 註冊成功後自動分配兩張新會員優惠券(目前狀態一直呈現4，已過期)
    const couponIds = [32, 33]
    const claimedAt = new Date()
    // const expirationDate = new Date();
    // expirationDate.setDate(claimedAt.getDate() + 90);

    for (const couponId of couponIds) {
      await db.query(
        'INSERT INTO member_coupon (user_id, coupon_id, status, claimed_at, expiration_date) VALUES (?, ?, ?, ?, DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY))',
        [userId, couponId, 2, claimedAt]
      )
    }

    return res.json({
      status: 'success',
      message: '註冊成功，已自動分配新會員優惠券',
      data: null,
    })
  } else {
    return res.json({ status: 'error', message: '新增到資料庫失敗' })
  }
})

// 登入用
router.post('/login', async (req, res, next) => {
  console.log(req.body)

  const loginUser = req.body

  // 1. 先用 account 查詢該會員
  const [rows] = await db.query('SELECT * FROM user WHERE account = ?', [
    loginUser.account,
  ])

  if (rows.length === 0) {
    return res.json({ status: 'error', message: '該會員不存在' })
  }

  const dbUser = rows[0]

  // 使用明文密碼進行比對
  const isValid = loginUser.password === dbUser.password

  if (!isValid) {
    return res.json({ status: 'error', message: '密碼錯誤' })
  }

  const returnUser = {
    id: dbUser.ID,
    account: dbUser.account,
  }

  // 產生存取令牌 (access token)，其中包含會員資料
  const accessToken = jsonwebtoken.sign(returnUser, accessTokenSecret, {
    expiresIn: '3d',
  })

  // 使用 httpOnly cookie 來讓瀏覽器端儲存 access token
  res.cookie('accessToken', accessToken, { httpOnly: true })

  return res.json({
    status: 'success',
    data: { accessToken },
  })
})

// 登出用
router.post('/logout', authenticate, (req, res) => {
  res.clearCookie('accessToken', { httpOnly: true })
  res.json({ status: 'success', data: null })
})

// 更新會員資料
router.put('/update-profile', authenticate, async (req, res, next) => {
  const id = req.user.id // 獲取用戶 ID
  const updateUser = req.body // 獲取前端傳遞的資料

  let result = null

  if (updateUser.password) {
    // 如果需要更新密碼
    result = await db.query(
      'UPDATE `user` SET `member_name` = ?, `password` = ?, `email` = ?, `gender` = ?, `phone` = ?, `birthdate` = ?, `address` = ? WHERE `ID` = ?;',
      [
        updateUser.member_name,
        updateUser.password, // 密碼處理
        updateUser.email,
        updateUser.gender,
        updateUser.phone,
        updateUser.birthdate,
        updateUser.address,
        id,
      ]
    )
  } else {
    // 如果不需要更新密碼
    result = await db.query(
      'UPDATE `user` SET `member_name` = ?, `email` = ?, `gender` = ?, `phone` = ?, `birthdate` = ?, `address` = ? WHERE `ID` = ?;',
      [
        updateUser.member_name,
        updateUser.email,
        updateUser.gender,
        updateUser.phone,
        updateUser.birthdate,
        updateUser.address,
        id,
      ]
    )
  }

  const [rows2] = result

  if (rows2.affectedRows > 0) {
    // 更新成功後查詢最新會員資料
    const [updatedRows] = await db.query('SELECT * FROM user WHERE ID = ?', [
      id,
    ])

    if (updatedRows.length > 0) {
      const updatedUser = updatedRows[0]
      delete updatedUser.password // 不返回密碼

      // 返回最新會員資料
      return res.json({ status: 'success', data: updatedUser })
    } else {
      // 無法查詢到更新的資料
      return res.json({
        status: 'error',
        message: '更新成功，但無法獲取最新資料',
      })
    }
  } else {
    // 更新失敗
    return res.json({ status: 'error', message: '更新到資料庫失敗' })
  }
})

router.post('/change-password', authenticate, async (req, res) => {
  try {
    console.log('收到請求資料:', req.body); // 檢查請求資料
    const { origin, new: newPassword } = req.body;

    const [rows] = await db.query('SELECT password FROM user WHERE id = ?', [req.user.id]);
    console.log('查詢到的密碼:', rows);

    if (!rows.length || rows[0].password !== origin) {
      return res.status(400).json({ status: 'error', message: '原密碼錯誤' });
    }

    await db.query('UPDATE user SET password = ? WHERE id = ?', [newPassword, req.user.id]);
    console.log('密碼更新成功');
    res.json({ status: 'success', message: '密碼修改成功' });
  } catch (error) {
    console.error('修改密碼時發生錯誤:', error);
    res.status(500).json({ status: 'error', message: '伺服器錯誤' });
  }
});



export default router
