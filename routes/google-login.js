import express from 'express'
const router = express.Router()

import sequelize from '#configs/db.js'
const { User } = sequelize.models

import jsonwebtoken from 'jsonwebtoken'
// 存取`.env`設定檔案使用
import 'dotenv/config.js'

// 定義安全的私鑰字串
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET

router.post('/', async function (req, res, next) {
  console.log(JSON.stringify(req.body))

  // 檢查從 react 來的資料
  if (!req.body.providerId || !req.body.uid) {
    return res.json({ status: 'error', message: '缺少 Google 登入資料' })
  }

  const { displayName, email, uid, photoURL } = req.body
  const google_uid = uid

  try {
    // 查詢資料庫是否有相同 google_uid 的資料
    const total = await User.count({
      where: {
        google_uid,
      },
    })

    // 回傳給前端的使用者資料
    let returnUser = {
      id: 0,
      member_name: '',
      account: '',
      email: '',
      google_uid: '',
      photo_url: '',
    }

    if (total) {
      // 如果有資料，則查詢資料庫中的該會員資料
      const dbUser = await User.findOne({
        where: {
          google_uid,
        },
        raw: true, // 只需要資料表中的資料
      })
      console.log('dbUser',dbUser)

      // 將資料庫的資料回傳給前端
      returnUser = {
        id: dbUser.ID,
        member_name: dbUser.member_name,
        account: dbUser.account,
        email: dbUser.email,
        google_uid: dbUser.google_uid,
        photo_url: dbUser.photo_url,
      }
    } else {
      // 如果沒有資料，建立新的會員資料
      const newUser = {
        member_name: displayName,
        email: email,
        google_uid,
        photo_url: photoURL,
        account: '', // Google 登入沒有 account 與 password 資訊，先設為空字串
        password: '', // 密碼設為空字串
        gender: null,
        phone: null,
        birthdate: null,
        address: null,
      }

      // 新增會員資料到資料庫
      const createdUser = await User.create(newUser)
      console.log(createdUser)

      // 回傳新增後的資料
      returnUser = {
        id: createdUser.ID,
        member_name: createdUser.member_name,
        account: createdUser.account,
        email: createdUser.email,
        google_uid: createdUser.google_uid,
        photo_url: createdUser.photo_url,
      }
      
    }

    console.log(returnUser)

    // 產生存取令牌(access token)，包含使用者資料
    const accessToken = jsonwebtoken.sign(returnUser, accessTokenSecret, {
      expiresIn: '3d',
    })

    // 使用 httpOnly cookie 儲存 access token
    res.cookie('accessToken', accessToken, { httpOnly: true })

    // 將 access token 回傳到前端
    return res.json({
      status: 'success',
      data: {
        accessToken,
      },
    })
  } catch (e) {
    // 將 access token 回傳到前端
    console.log(e)
    return res.json({
      status: 'error',
      message: e,
    })
  }
})

export default router
