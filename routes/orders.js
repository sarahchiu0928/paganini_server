// server\routes\orders.js
import express from 'express'
const router = express.Router()
import sequelize from '#configs/db.js'
import authenticate from '#middlewares/authenticate.js'
import moment from 'moment-timezone'

// 更新 delivery_status 的邏輯封裝成函數
const updateDeliveryStatus = async () => {
  try {
    await sequelize.query(
      `
      UPDATE orders
      SET 
          delivery_status = 1,
          payment_status = 1
      WHERE 
          come_date < CURDATE() 
          AND (delivery_status != 1 OR payment_status != 1);

      `,
      {
        type: sequelize.QueryTypes.UPDATE,
      }
    )
  } catch (error) {
    console.error('無法更新 delivery_status:', error)
  }
}

// GET - 取得所有訂單資料
router.get('/', authenticate, async (req, res) => {
  const user_id = req.user.id
  try {
    // 首先更新符合條件的訂單狀態
    await updateDeliveryStatus(user_id)

    const orders = await sequelize.query(
      `
      SELECT orders.*, 
       shop.shop_name, 
       shop.shop_area, 
       shop.shop_address, 
       shop.shop_phone, 
       shop.shop_link, 
       shop.shop_opentime
      FROM orders
      LEFT JOIN shop ON orders.shop_id = shop.id
      WHERE orders.user_id = :user_id;
    `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )
    // 將日期欄位轉換成台灣時區
    const ordersWithTaipeiTime = orders.map((order) => {
      if (order.order_date) {
        order.order_date = moment(order.order_date)
          .tz('Asia/Taipei')
          .format('YYYY-MM-DD HH:mm:ss')
      }
      return order
    })
    return res.json({ status: 'success', data: ordersWithTaipeiTime })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// GET - 取得最新訂單資料
router.get('/last', authenticate, async (req, res) => {
  const user_id = req.user.id
  try {
    const orders = await sequelize.query(
      `
      SELECT orders.*, 
        shop.shop_name, 
        shop.shop_area, 
        shop.shop_address, 
        shop.shop_phone, 
        shop.shop_link, 
        shop.shop_opentime
      FROM orders
      LEFT JOIN shop ON orders.shop_id = shop.id
      WHERE orders.user_id = :user_id
      ORDER BY orders.order_id DESC
      LIMIT 1;

    `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )
    // 將日期欄位轉換成台灣時區
    const ordersWithTaipeiTime = orders.map((order) => {
      if (order.order_date) {
        order.order_date = moment(order.order_date)
          .tz('Asia/Taipei')
          .format('YYYY-MM-DD HH:mm:ss')
      }
      return order
    })
    return res.json({ status: 'success', data: ordersWithTaipeiTime })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// GET - 取得進行中訂單資料
router.get('/ongoing', authenticate, async (req, res) => {
  const user_id = req.user.id
  try {
    // 首先更新符合條件的訂單狀態
    await updateDeliveryStatus(user_id)

    const orders = await sequelize.query(
      `
      SELECT orders.*, 
       shop.shop_name, 
       shop.shop_area, 
       shop.shop_address, 
       shop.shop_phone, 
       shop.shop_link, 
       shop.shop_opentime
      FROM orders
      LEFT JOIN shop ON orders.shop_id = shop.id
      WHERE orders.user_id = :user_id && delivery_status = 0
      ORDER BY orders.order_id DESC; -- 降序排序
    `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )
    // 將日期欄位轉換成台灣時區
    const ordersWithTaipeiTime = orders.map((order) => {
      if (order.order_date) {
        order.order_date = moment(order.order_date)
          .tz('Asia/Taipei')
          .format('YYYY-MM-DD HH:mm:ss')
      }
      return order
    })
    return res.json({ status: 'success', data: ordersWithTaipeiTime })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// GET - 取得歷史訂單資料
router.get('/history', authenticate, async (req, res) => {
  const user_id = req.user.id
  try {
    // 首先更新符合條件的訂單狀態
    await updateDeliveryStatus(user_id)

    const orders = await sequelize.query(
      `
      SELECT orders.*, 
       shop.shop_name, 
       shop.shop_area, 
       shop.shop_address, 
       shop.shop_phone, 
       shop.shop_link, 
       shop.shop_opentime
      FROM orders
      LEFT JOIN shop ON orders.shop_id = shop.id
      WHERE orders.user_id = :user_id  && delivery_status = 1
      ORDER BY orders.order_id DESC; -- 降序排序
    `,
      {
        replacements: { user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )
    // 將日期欄位轉換成台灣時區
    const ordersWithTaipeiTime = orders.map((order) => {
      if (order.order_date) {
        order.order_date = moment(order.order_date)
          .tz('Asia/Taipei')
          .format('YYYY-MM-DD HH:mm:ss')
      }
      return order
    })
    return res.json({ status: 'success', data: ordersWithTaipeiTime })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// GET - 取得特定訂單的商品列表
router.get('/:order_id/items', authenticate, async (req, res) => {
  const { order_id } = req.params
  const user_id = req.user.id

  try {
    // 首先更新符合條件的訂單狀態
    await updateDeliveryStatus(user_id)

    const orderItems = await sequelize.query(
      `
      SELECT 
        order_items.product_id,
        order_items.quantity,
        order_items.size,
        order_items.price,
        order_items.discount_price,
        product.product_name,
        product_brand.name AS product_brand_name,
        product_category.name AS category_name,
        (
          SELECT product_picture.picture_url
          FROM product_picture
          WHERE product_picture.product_id = product.id
            AND product_picture.picture_url LIKE '%-1.%'
          LIMIT 1
        ) AS picture_url
      FROM order_items
      JOIN product ON order_items.product_id = product.id
      JOIN product_brand ON product.brand_id = product_brand.id
      JOIN product_category ON product.category_id = product_category.id
      WHERE order_items.order_id = :order_id AND EXISTS (
        SELECT 1 FROM orders WHERE order_id = :order_id AND user_id = :user_id
      );
      `,
      {
        replacements: { order_id, user_id },
        type: sequelize.QueryTypes.SELECT,
      }
    )

    return res.json({ status: 'success', data: orderItems })
  } catch (error) {
    console.error('無法取得訂單中的商品列表:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法取得訂單中的商品列表' })
  }
})

// POST - 新增訂單資料
router.post('/add', authenticate, async (req, res) => {
  const user_id = req.user.id

  try {
    // Step 1: 計算訂單總金額
    const [result] = await sequelize.query(
      `SELECT 
          SUM(
              CASE 
                  WHEN discount_price IS NOT NULL THEN discount_price * quantity 
                  ELSE price * quantity 
              END
          ) AS total_amount
       FROM 
          cart
       JOIN 
          product ON cart.product_id = product.id
       WHERE 
          cart.user_id = ? 
          AND cart.checked = 1;`,
      {
        replacements: [user_id],
        type: sequelize.QueryTypes.SELECT,
      }
    )
    const total_amount = result.total_amount
    if (total_amount === null) throw new Error('無法計算訂單總金額')

    // Step 2: 取得會員填寫資料
    const {
      shipping_person,
      shipping_phone,
      delivery_method,
      delivery_address,
      shop_id,
      come_date,
      payment_method,
      card_number,
      card_holder,
      expiry_date,
      security_code,
      coupon_id,
    } = req.body

    // 檢查必填欄位
    if (!shipping_person || !shipping_phone) {
      throw new Error('缺少必要的會員資料：姓名或電話')
    }

    // 配送方式檢查
    if (delivery_method === '宅配') {
      if (!delivery_address) {
        throw new Error('缺少必要的會員資料：宅配需要提供地址')
      }
    } else if (delivery_method === '到店取貨') {
      if (!shop_id) {
        throw new Error('缺少必要的會員資料：到店取貨需要提供門市ID')
      }
    } else {
      throw new Error('無效的配送方式')
    }

    // 付款方式檢查
    if (payment_method === '信用卡') {
      if (!card_number || !card_holder || !expiry_date || !security_code) {
        throw new Error(
          '缺少必要的信用卡資訊：卡號、持卡人姓名、有效日期或安全碼'
        )
      }
    } else if (payment_method !== '信用卡' && payment_method !== '到店付款') {
      throw new Error('無效的付款方式')
    }

    // Step 3: 取得當下時間
    const now = moment().format('YYYYMMDD')

    // Step 4: 判斷配送、付款方式
    const deliveryCode = delivery_method === '宅配' ? '01' : '02'
    const paymentCode = payment_method === '信用卡' ? '01' : '02'
    // 當 配送方式 為 宅配 時，shop_id 設為 NULL
    const shopIdValue = delivery_method === '宅配' ? null : shop_id
    const comeDate = delivery_method === '宅配' ? null : come_date

    // 當 付款方式 為 信用卡，設定付款狀態為已付款
    const paymentStatus = payment_method === '信用卡' ? 1 : 0

    // Step 5: 建立新訂單資料
    const [orderInsertResult] = await sequelize.query(
      `INSERT INTO orders 
    (user_id, coupon_id, total_amount, shipping_person, shipping_phone, delivery_method, 
    delivery_address, shop_id, come_date, payment_method, card_number, card_holder, 
    expiry_date, security_code, payment_status) 
  VALUES ( ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      {
        replacements: [
          user_id,
          coupon_id,
          total_amount,
          shipping_person,
          shipping_phone,
          delivery_method,
          delivery_address,
          shopIdValue,
          comeDate,
          payment_method,
          card_number,
          card_holder,
          expiry_date,
          security_code,
          paymentStatus,
        ],
        type: sequelize.QueryTypes.INSERT,
      }
    )
    if (orderInsertResult === 0) throw new Error('訂單資料插入失敗')

    // Step 6: 取得剛才插入的 order_id
    const [orderResult] = await sequelize.query(
      `SELECT LAST_INSERT_ID() AS order_id`
    )
    const order_id = orderResult[0]?.order_id
    if (!order_id) throw new Error('無法取得新訂單的 order_id')
    console.log('Order ID:', order_id)

    // Step 7: 建立訂單編號並更新剛插入的訂單編號
    const order_code = `CM${now}${deliveryCode}${paymentCode}${String(user_id).padStart(2, '0')}${String(order_id).padStart(3, '0')}`
    await sequelize.query(
      `
  UPDATE orders 
  SET order_code = :order_code
  WHERE order_id = :order_id;
  `,
      {
        replacements: { order_code, order_id },
        type: sequelize.QueryTypes.UPDATE,
      }
    )
    console.log(
      `Order Code ${order_code} successfully updated for Order ID ${order_id}`
    )

    // Step 8: 取得購物車中該會員ID有勾選的項目插入到 order_items 表中
    const cartItems = await sequelize.query(
      `
  SELECT 
      cart.user_id, 
      cart.product_id, 
      cart.quantity, 
      cart.size, 
      product.price, 
      product.discount_price
  FROM 
      cart
  JOIN 
      product ON cart.product_id = product.id
  WHERE 
      cart.user_id = ? AND cart.checked = 1`,
      {
        replacements: [user_id],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    // 檢查 cartItems 的內容
    console.log('Cart Items:', cartItems)

    // 檢查是否有返回的項目
    if (!cartItems || cartItems.length === 0) {
      throw new Error('購物車中沒有勾選的項目')
    }

    // 建立 items 陣列
    const items = cartItems.map((item) => [
      order_id,
      item.product_id,
      item.user_id,
      item.size,
      item.quantity,
      item.price,
      item.discount_price || null,
    ])
    console.log('items:', items)

    // 手動展平 items
    const replacements = []
    items.forEach((item) => {
      replacements.push(...item) // 將每個子陣列元素展平成一維陣列
    })
    console.log('replacements:', replacements)

    // 批量插入到 order_items 表
    await sequelize.query(
      `INSERT INTO order_items (order_id, product_id,user_id, size, quantity, price, discount_price)
   VALUES ${items.map(() => '(?, ?, ?, ?, ?,?, ?)').join(', ')}`,
      {
        replacements, // 使用手動展平的 replacements 陣列
        type: sequelize.QueryTypes.INSERT,
      }
    )

    // Step 9: 清除購物車中該會員ID有勾選的項目
    await sequelize.query(
      `DELETE FROM cart WHERE user_id = ? AND checked = 1;`,
      {
        replacements: [user_id],
        type: sequelize.QueryTypes.DELETE,
      }
    )

    // Step 10: 更新使用者優惠券狀態，帶入今天日期，並將status改為3
    if (coupon_id) {
      await sequelize.query(
        `
        UPDATE member_coupon 
        SET used_at = :today, status = 3 
        WHERE user_id = :user_id AND coupon_id = :coupon_id;
        `,
        {
          replacements: {
            today: moment().format('YYYY-MM-DD'), // 設定今天日期為 used_at
            user_id,
            coupon_id,
          },
          type: sequelize.QueryTypes.UPDATE,
        }
      )
    }

    // Step 11: 減少 product_size 表中根據 product_id 和 size 的庫存
    await Promise.all(
      items.map(async ([, product_id,, size,quantity]) => {
        console.log(
          `Updating stock for Product ID: ${product_id}, Size: ${size}, Quantity: ${quantity}`
        )
        await sequelize.query(
          `UPDATE product_size SET stock = stock - :quantity 
           WHERE product_id = :product_id AND size = :size;`,
          {
            replacements: { quantity, product_id, size },
            type: sequelize.QueryTypes.UPDATE,
          }
        )
      })
    )

    // 成功回應
    return res.json({ status: 'success', message: '訂單已成立' })
  } catch (error) {
    console.error('訂單處理錯誤:', error.message)
    console.error('訂單處理錯誤:', error)
    return res.status(500).json({ status: 'error', message: error.message })
  }
})

export default router
