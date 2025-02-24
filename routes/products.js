import express from 'express'
const router = express.Router()

// 資料庫連線
import sequelize from '#configs/db.js'

// GET - 取得所有資料
router.get('/', async function (req, res) {
  const {
    page = 1,
    limit = 9,
    search = '',
    category = '',
    brand = '',
    sort = 'default',
  } = req.query
  const offset = (page - 1) * limit

  // 建立動態 SQL 查詢語句
  let baseQuery = `
    SELECT 
      product.id, 
      product.product_name, 
      product.price, 
      product.discount_price, 
      product.description, 
      product_category.name AS category_name, 
      product_brand.name AS brand_name,
      GROUP_CONCAT(DISTINCT product_picture.picture_url ORDER BY product_picture.id ASC) AS pictures,
      CASE 
        WHEN COUNT(product_size.size) = 0 THEN MAX(product_size.stock)  
        ELSE GROUP_CONCAT(DISTINCT CONCAT(product_size.size, ':', product_size.stock))
      END AS sizes
    FROM product
    JOIN product_brand ON product.brand_id = product_brand.id
    JOIN product_category ON product.category_id = product_category.id
    LEFT JOIN product_picture ON product.id = product_picture.product_id
    LEFT JOIN product_size ON product.id = product_size.product_id
  `

  const conditions = []
  const replacements = {}

  if (category) {
    conditions.push(`product_category.name = :category`)
    replacements.category = category
  }

  if (brand) {
    conditions.push(`product_brand.name = :brand`)
    replacements.brand = brand
  }

  if (search) {
    conditions.push(`(
      product.product_name LIKE :search OR 
      product_brand.name LIKE :search OR 
      product_category.name LIKE :search
    )`)
    replacements.search = `%${search}%`
  }

  if (req.query.minPrice) {
    conditions.push(`COALESCE(product.discount_price, product.price) >= :minPrice`)
    replacements.minPrice = parseInt(req.query.minPrice, 10)
  }
  
  if (req.query.maxPrice) {
    conditions.push(`COALESCE(product.discount_price, product.price) <= :maxPrice`)
    replacements.maxPrice = parseInt(req.query.maxPrice, 10)
  }

  if (conditions.length > 0) {
    baseQuery += ` WHERE ` + conditions.join(' AND ')
  }

  // 加入 GROUP BY 和 ORDER BY 條件
  baseQuery += ` GROUP BY product.id`
  if (sort === 'priceAsc') baseQuery += ` ORDER BY COALESCE(product.discount_price, product.price) ASC`
  else if (sort === 'priceDesc') baseQuery += ` ORDER BY COALESCE(product.discount_price, product.price) DESC`
  else if (sort === 'newest') baseQuery += ` ORDER BY product.id DESC`
  else if (sort === 'oldest') baseQuery += ` ORDER BY product.id ASC`

  // 分頁
  baseQuery += ` LIMIT :limit OFFSET :offset`
  replacements.limit = parseInt(limit, 10)
  replacements.offset = parseInt(offset, 10)

  try {
    // 執行查詢並將 category 和 brand 傳入 replacements
    const [products] = await sequelize.query(baseQuery, {
      replacements,
    })

    // 查詢符合條件的資料總數量
    const countQuery = `
      SELECT COUNT(DISTINCT product.id) as count 
      FROM product
      JOIN product_brand ON product.brand_id = product_brand.id
      JOIN product_category ON product.category_id = product_category.id
      LEFT JOIN product_picture ON product.id = product_picture.product_id
      LEFT JOIN product_size ON product.id = product_size.product_id
      ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}
    `

    const [totalResult] = await sequelize.query(countQuery, { replacements })
    const total = totalResult[0].count

    // 查詢所有商品的總數量（不帶篩選條件）
    const overallCountQuery = `
    SELECT COUNT(DISTINCT product.id) as count 
    FROM product
`
    const [overallCountResult] = await sequelize.query(overallCountQuery)
    const overallTotal = overallCountResult[0].count

    return res.json({
      status: 'success',
      data: {
        products,
        total, // 當前篩選條件的總數量
        overallTotal, // 所有商品的總數量
      },
    })
  } catch (error) {
    console.error('無法取得資料:', error)
    return res.status(500).json({ status: 'error', message: '無法取得資料' })
  }
})

// 新增: 取得所有類別和品牌的路由
router.get('/categories-and-brands', async function (req, res) {
  try {
    // 取得所有類別
    const [categories] = await sequelize.query(`
      SELECT DISTINCT 
        product_category.name,
        COUNT(product.id) as count
      FROM product_category
      LEFT JOIN product ON product.category_id = product_category.id
      GROUP BY product_category.name
    `)

    // 取得所有品牌
    const [brands] = await sequelize.query(`
      SELECT DISTINCT 
        product_brand.name,
        COUNT(product.id) as count
      FROM product_brand
      LEFT JOIN product ON product.brand_id = product_brand.id
      GROUP BY product_brand.name
    `)

    const [priceRange] = await sequelize.query(`
      SELECT 
        MIN(CASE 
          WHEN product.discount_price IS NOT NULL AND product.discount_price > 0 
          THEN product.discount_price 
          ELSE product.price 
        END) as min_price,
        MAX(CASE 
          WHEN product.discount_price IS NOT NULL AND product.discount_price > 0 
          THEN product.discount_price 
          ELSE product.price 
        END) as max_price
      FROM product
      WHERE product.price > 0
    `)

    return res.json({
      status: 'success',
      data: {
        categories,
        brands,
        priceRange: priceRange[0]
      },
    })
  } catch (error) {
    console.error('無法取得類別和品牌資料:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法取得類別和品牌資料' })
  }
})

router.get('/:id', async (req, res) => {
  const { id } = req.params

  try {
    // 使用原生 SQL 查詢指定 id 的商品
    const [product] = await sequelize.query(
      `SELECT 
        product.id, 
        product.product_name, 
        product.price, 
        product.discount_price, 
        product.description, 
        product_category.name AS category_name, 
        product_brand.name AS brand_name,
        GROUP_CONCAT(DISTINCT product_picture.picture_url ORDER BY product_picture.id ASC) AS pictures,
        GROUP_CONCAT(
          DISTINCT CASE 
            WHEN product_size.size IS NOT NULL AND product_size.size != '' THEN CONCAT(product_size.size, ':', product_size.stock)
            ELSE CAST(product_size.stock AS CHAR)
          END
        ) AS sizes
      FROM product
      JOIN product_brand ON product.brand_id = product_brand.id
      JOIN product_category ON product.category_id = product_category.id
      LEFT JOIN product_picture ON product.id = product_picture.product_id
      LEFT JOIN product_size ON product.id = product_size.product_id
      WHERE product.id = ?
      GROUP BY product.id;
`,
      {
        replacements: [id], // 用戶輸入的 id 替換進查詢語句中
        type: sequelize.QueryTypes.SELECT, // 指定查詢類型
      }
    )

    if (product) {
      return res.json({ status: 'success', data: product })
    } else {
      return res.status(404).json({ error: { message: 'Not Found' } })
    }
  } catch (error) {
    console.error('資料庫查詢錯誤:', error)
    return res.status(500).json({ error: { message: 'Server Error' } })
  }
})

// 新增取得推薦商品的路由
router.get('/recommend/:id', async (req, res) => {
  const { id } = req.params

  try {
    // 先獲取當前商品的類別和品牌
    const [currentProduct] = await sequelize.query(
      `
      SELECT 
        product.category_id,
        product.brand_id
      FROM product
      WHERE product.id = ?
    `,
      {
        replacements: [id],
        type: sequelize.QueryTypes.SELECT,
      }
    )

    if (!currentProduct) {
      return res.status(404).json({ status: 'error', message: '找不到商品' })
    }

    // 查詢推薦商品
    const [recommendProducts] = await sequelize.query(
      `
      (
        -- 第一順位：相同類別且相同品牌的商品
        SELECT 
          product.id, 
          product.product_name, 
          product.price, 
          product.discount_price,
          product_brand.name AS brand_name,
          GROUP_CONCAT(DISTINCT product_picture.picture_url ORDER BY product_picture.id ASC) AS pictures
        FROM product
        JOIN product_brand ON product.brand_id = product_brand.id
        LEFT JOIN product_picture ON product.id = product_picture.product_id
        WHERE product.category_id = :category_id 
        AND product.brand_id = :brand_id
        AND product.id != :product_id
        GROUP BY product.id
        ORDER BY RAND()
        LIMIT 4
      )
      UNION
      (
        -- 第二順位：相同類別的其他品牌商品
        SELECT 
          product.id, 
          product.product_name, 
          product.price, 
          product.discount_price,
          product_brand.name AS brand_name,
          GROUP_CONCAT(DISTINCT product_picture.picture_url ORDER BY product_picture.id ASC) AS pictures
        FROM product
        JOIN product_brand ON product.brand_id = product_brand.id
        LEFT JOIN product_picture ON product.id = product_picture.product_id
        WHERE product.category_id = :category_id 
        AND product.brand_id != :brand_id
        AND product.id != :product_id
        GROUP BY product.id
        ORDER BY RAND()
      )
      LIMIT 4
    `,
      {
        replacements: {
          category_id: currentProduct.category_id,
          brand_id: currentProduct.brand_id,
          product_id: id,
        },
      }
    )

    return res.json({ status: 'success', data: recommendProducts })
  } catch (error) {
    console.error('無法取得推薦商品:', error)
    return res
      .status(500)
      .json({ status: 'error', message: '無法取得推薦商品' })
  }
})

export default router
