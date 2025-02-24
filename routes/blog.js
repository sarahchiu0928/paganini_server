import express from 'express'
const router = express.Router()

import authenticate from '#middlewares/authenticate.js' // 確保這個中介軟體會在這之前運行

// 資料庫連線
import sequelize from '#configs/db.js'

// import multer from 'multer'
// import path from 'path'
// import { fileURLToPath } from 'url'

// const __filename = fileURLToPath(import.meta.url)
// const __dirname = path.dirname(__filename)
// // upload image
// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'public/blog')
//   },
//   filename: (req, file, cb) => {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
//     cb(null, 'blog_cover' + uniqueSuffix + path.extname(file.originalname))
//   },
// })
// const upload = multer({ storage: storage })

// router.use('/blog', express.static(path.join(__dirname, 'public/blog')))

// GET - 獲取所有部落格文章
router.get('/', async function (req, res) {
  try {
    const {
      order = 'DESC',
      search = '',
      category = '',
      page = 1,
      limit = 12,
    } = req.query

    // 验证并转换分页参数
    const validatedPage = Math.max(1, parseInt(page))
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit)))
    const offset = (validatedPage - 1) * validatedLimit

    // 构建基础查询
    let sqlSelect = `SELECT 
      blog.id,
      blog.user_id,
      blog.category_id,
      blog.title,
      blog.content,
      COALESCE(blog.updated_at, blog.created_at) AS display_time,
      blog.created_at,
      blog.updated_at,
      blog.state,
      blog.cover_img_url,
      user.member_name AS author_name,
      blog_category.name AS category_name
    FROM blog
    LEFT JOIN user ON blog.user_id = user.id
    LEFT JOIN blog_category ON blog.category_id = blog_category.id`

    // 构建 WHERE 条件
    const conditions = []
    const params = []

    // 搜索条件
    if (search?.trim()) {
      conditions.push(`(
        blog.title LIKE ? OR 
        blog.content LIKE ? 
      )`)
      const searchTerm = `%${search.trim()}%`
      params.push(searchTerm, searchTerm)
    }

    // 类别条件
    if (category) {
      conditions.push(`blog_category.name = ?`) // 使用类别名称
      params.push(category)
    }

    // 确保只有状态不为 0 的文章会被查询
    conditions.push('blog.state != 0')

    // 添加 WHERE 子句
    if (conditions.length > 0) {
      sqlSelect += ` WHERE ${conditions.join(' AND ')}`
    }

    // 添加排序，按照 id 排序
    sqlSelect += ` ORDER BY blog.id ${order === 'ASC' ? 'ASC' : 'DESC'}`

    // 添加分页
    sqlSelect += ` LIMIT ? OFFSET ?`
    params.push(validatedLimit, offset)

    // 执行主查询
    const blogs = await sequelize.query(sqlSelect, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT,
    })

    // 如果没有找到博客文章，返回空结果
    if (!blogs || blogs.length === 0) {
      return res.json({
        blogs: [],
        total_count: 0,
        total_pages: 0,
        current_page: validatedPage,
        category_counts: {},
      })
    }

    // 计算符合条件的总博客数
    const sqlCount = `SELECT COUNT(DISTINCT blog.id) as total_count
      FROM blog
      LEFT JOIN user ON blog.user_id = user.id
      LEFT JOIN blog_category ON blog.category_id = blog_category.id
      ${conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''}`
    const [countResult] = await sequelize.query(sqlCount, {
      replacements: params.slice(0, params.length - 2),
      type: sequelize.QueryTypes.SELECT,
    })

    // 获取分类文章数量（排除已删除的文章）
    const categoryCountSql = `
      SELECT 
        bc.name AS category_name,
        COUNT(b.id) AS blog_count
      FROM blog_category bc
      LEFT JOIN blog b ON b.category_id = bc.id
      WHERE b.state != 0  -- 排除已删除的文章
      GROUP BY bc.id, bc.name
    `
    const categoryCounts = await sequelize.query(categoryCountSql, {
      type: sequelize.QueryTypes.SELECT,
    })

    // 创建分类计数映射
    const categoryCountsMap = {}

    // 填充每个分类的计数
    categoryCounts.forEach((item) => {
      if (item && item.category_name) {
        categoryCountsMap[item.category_name] = item.blog_count
      }
    })

    // 确保 "所有类别" 显示所有文章的总数
    categoryCountsMap['所有類別'] = countResult.total_count

    // 确保 "所有类别" 以外的类别也有数据，即使其数量为 0
    const allCategories = [
      '教學',
      '保養',
      '選購指南',
      '小百科',
      '檢定考試',
      '學習經驗分享',
    ]
    allCategories.forEach((cat) => {
      if (!categoryCountsMap[cat]) {
        categoryCountsMap[cat] = 0 // 如果没有该分类，确保其数量为 0
      }
    })

    // 返回结果
    return res.json({
      blogs: blogs,
      total_count: countResult.total_count,
      total_pages: Math.ceil(countResult.total_count / validatedLimit),
      current_page: validatedPage,
      category_counts: categoryCountsMap,
    })
  } catch (error) {
    console.error('博客查询错误:', error)
    return res.status(500).json({
      error: '获取博客文章失败',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

// GET - 根據 id 取得特定資料
router.get('/:id', async function (req, res) {
  const blogId = req.params.id

  try {
    // 获取当前部落格的详细信息（包括用户名字、时间、标题、内容、分类名称）
    const blogQuery = `
      SELECT
        blog.id,
        blog.title,
        blog.content,
        blog.created_at,
        blog.updated_at,
        user.member_name AS author_name,
        blog_category.name AS category_name,
        blog.cover_img_url,
        blog.state  -- 假设数据库表中有一个state字段
      FROM blog
      JOIN user ON blog.user_id = user.ID
      JOIN blog_category ON blog.category_id = blog_category.id
      WHERE blog.id = :blogId AND blog.state != 0  -- 仅查询状态不为0的文章
    `

    // 获取当前部落格的详细数据
    const [currentBlog] = await sequelize.query(blogQuery, {
      replacements: { blogId },
      type: sequelize.QueryTypes.SELECT,
    })

    if (!currentBlog) {
      return res
        .status(404)
        .json({ error: 'Blog not found or blog is inactive' })
    }

    // 处理时间字段，如果更新时为空，则使用创建时间
    const displayTime = currentBlog.updated_at
      ? currentBlog.updated_at
      : currentBlog.created_at

    // 获取上一篇和下一篇的部落格
    const prevBlogQuery = `
      SELECT title, id
      FROM blog
      WHERE id < :blogId AND state != 0  -- 确保上一篇文章的状态也不是0
      ORDER BY id DESC
      LIMIT 1
    `
    const nextBlogQuery = `
      SELECT title, id
      FROM blog
      WHERE id > :blogId AND state != 0  -- 确保下一篇文章的状态也不是0
      ORDER BY id ASC
      LIMIT 1
    `

    // 查询上一篇
    const [prevBlog] = await sequelize.query(prevBlogQuery, {
      replacements: { blogId },
      type: sequelize.QueryTypes.SELECT,
    })

    // 查询下一篇
    const [nextBlog] = await sequelize.query(nextBlogQuery, {
      replacements: { blogId },
      type: sequelize.QueryTypes.SELECT,
    })

    // 构造响应数据
    const response = {
      blog: {
        ...currentBlog,
        displayTime, // 显示时间，优先使用更新时间
      },
      prevBlog: prevBlog || null, // 如果上一篇不存在，则返回 null
      nextBlog: nextBlog || null, // 如果下一篇不存在，则返回 null
    }

    return res.json(response)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Internal server error' })
  }
})

// POST - 發布部落格文章
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // console.log(
    //   'Destination:',
    //   __dirname,
    //   path.join(__dirname, '../public/blog')
    // )

    cb(null, path.join(__dirname, '../public/blog'))
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9)
    cb(null, `blog_cover${uniqueSuffix}${path.extname(file.originalname)}`)
  },
})

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB file size limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png']
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Only .jpg and .png files are allowed!'), false)
    }
    cb(null, true)
  },
})

// Serve static files
router.use('/blog', express.static(path.join(__dirname, '../../public/blog')))

// Handle blog post creation
router.post(
  '/write',
  authenticate,
  upload.single('cover_img'),
  async (req, res) => {
    console.log('Request received for blog post creation')
    try {
      console.log('Request body:', req.body)
      console.log('Uploaded file:', req.file)

      // const { userID } = req.params
      const userID = req.body.user_id
      const { title, content, category, created_at } = req.body

      if (!title || !content || !category || !req.file) {
        return res.status(400).json({
          error: '請填寫標題、內容、分類和封面圖片',
        })
      }

      const coverImgUrl = `${req.file.filename}`

      const [result] = await sequelize.query(
        `INSERT INTO blog (
        user_id, 
        category_id, 
        title, 
        content, 
        cover_img_url, 
        state, 
        created_at, 
        updated_at
      ) VALUES (
        :userID, 
        :category, 
        :title, 
        :content, 
        :coverImgUrl, 
        1, 
        :createdAt, 
        NOW()
      )`,
        {
          replacements: {
            userID,
            category,
            title,
            content,
            coverImgUrl,
            createdAt: created_at || new Date().toISOString(),
          },
          type: sequelize.QueryTypes.INSERT,
          logging: console.log,
        }
      )

      if (result) {
        return res.status(201).json({
          message: '部落格文章已成功發布',
          blog: {
            id: result,
            title,
            content,
            category,
            cover_img_url: coverImgUrl,
            userID,
            createdAt: created_at || new Date(),
            updatedAt: new Date(),
          },
        })
      } else {
        return res.json({
          error: '發布部落格文章失敗，請稍後再試',
        })
      }
    } catch (error) {
      console.error('發布部落格文章錯誤:', error)
      return res.json({
        error: '伺服器錯誤，無法發布部落格文章',
      })
    }
  }
)

// 我的部落格
// Get current logged-in user's blog posts with search, category, and order support
router.get('/myblog/:userID', async function (req, res) {
  try {
    const { userID } = req.params // 取得用戶ID

    // 解構 query 參數 (默認按時間排序、每頁顯示 24 條記錄)
    const {
      order = 'DESC', // 排序
      search = '', // 搜尋
      category = '', // 類別篩選
      page = 1, // 頁碼
      limit = 12, // 每頁顯示數量
    } = req.query

    // 驗證並轉換頁碼和每頁顯示數量
    const validatedPage = Math.max(1, parseInt(page))
    const validatedLimit = Math.min(100, Math.max(1, parseInt(limit)))
    const offset = (validatedPage - 1) * validatedLimit

    // 基本的 SQL 查詢
    let sqlSelect = `
      SELECT 
        blog.id,
        blog.user_id,
        blog.category_id,
        blog.title,
        blog.content,
        COALESCE(blog.updated_at, blog.created_at) AS display_time,
        blog.created_at,
        blog.updated_at,
        blog.state,
        blog.cover_img_url,
        user.member_name AS author_name,
        blog_category.name AS category_name
      FROM blog
      LEFT JOIN user ON blog.user_id = user.id
      LEFT JOIN blog_category ON blog.category_id = blog_category.id
      WHERE blog.user_id = ?` // 只顯示當前用戶的文章

    const conditions = []
    const params = [userID] // 用戶 ID 參數

    // 搜索條件
    if (search?.trim()) {
      conditions.push(`(blog.title LIKE ? OR blog.content LIKE ?)`)
      const searchTerm = `%${search.trim()}%`
      params.push(searchTerm, searchTerm)
    }

    // 類別條件
    if (category) {
      conditions.push(`blog_category.name = ?`) // 使用類別名稱
      params.push(category)
    }

    // 確保只有狀態不是 0 的文章
    conditions.push('blog.state != 0')

    // 添加 WHERE 子句
    if (conditions.length > 0) {
      sqlSelect += ` AND ${conditions.join(' AND ')}`
    }

    // 添加排序，按照 created_at 排序
    sqlSelect += ` ORDER BY blog.created_at ${order === 'ASC' ? 'ASC' : 'DESC'}`

    // 添加分頁
    sqlSelect += ` LIMIT ? OFFSET ?`
    params.push(validatedLimit, offset)

    // 執行查詢並返回結果
    const blogs = await sequelize.query(sqlSelect, {
      replacements: params,
      type: sequelize.QueryTypes.SELECT,
    })

    // 如果未找到該用戶的文章，返回空數據
    if (!blogs || blogs.length === 0) {
      return res.json({
        blogs: [],
        total_count: 0,
        total_pages: 0,
        current_page: validatedPage,
        category_counts: {},
      })
    }

    // 計算符合條件的總博客數量
    const sqlCount = `
      SELECT COUNT(DISTINCT blog.id) as total_count
      FROM blog
      LEFT JOIN user ON blog.user_id = user.id
      LEFT JOIN blog_category ON blog.category_id = blog_category.id
      WHERE blog.user_id = ? ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}`
    const [countResult] = await sequelize.query(sqlCount, {
      replacements: params.slice(0, params.length - 2), // 修正分頁參數的錯誤
      type: sequelize.QueryTypes.SELECT,
    })

    // 獲取分類文章數量（排除已刪除的文章）
    const categoryCountSql = `
      SELECT 
        bc.name AS category_name,
        COUNT(b.id) AS blog_count
      FROM blog_category bc
      LEFT JOIN blog b ON b.category_id = bc.id
      WHERE b.user_id = ? AND b.state != 0  -- 排除已删除的文章
      GROUP BY bc.id, bc.name`
    const categoryCounts = await sequelize.query(categoryCountSql, {
      replacements: [userID],
      type: sequelize.QueryTypes.SELECT,
    })

    // 创建分类计数映射
    const categoryCountsMap = {}

    // 填充每个分类的计数
    categoryCounts.forEach((item) => {
      if (item && item.category_name) {
        categoryCountsMap[item.category_name] = item.blog_count
      }
    })

    // 確保 "所有類別" 顯示所有文章的總數
    categoryCountsMap['所有類別'] = countResult.total_count

    // 返回結果
    return res.json({
      blogs: blogs,
      total_count: countResult.total_count,
      total_pages: Math.ceil(countResult.total_count / validatedLimit),
      current_page: validatedPage,
      category_counts: categoryCountsMap,
    })
  } catch (error) {
    console.error('博客查詢錯誤:', error)
    return res.status(500).json({
      error: '無法獲取用戶文章',
      details:
        process.env.NODE_ENV === 'development' ? error.message : undefined,
    })
  }
})

// PUT - 更新資料
import { QueryTypes } from 'sequelize' // 引入 QueryTypes 用於查詢
// 取得文章資訊
router.get('/myblog/edit/:id', async function (req, res) {
  const blogId = req.params.id

  try {
    // SQL 查詢來獲取文章資料
    const blogQuery = `
      SELECT
        blog.id,
        blog.title,
        blog.content,
        blog.created_at, 
        blog.updated_at,  
        blog.user_id,
        blog.category_id,     
        blog_category.name AS category_name,
        blog.cover_img_url,
        blog.state  
      FROM blog
      JOIN blog_category ON blog.category_id = blog_category.id
      WHERE blog.id = :blogId AND blog.state != 0  
    `

    // 執行查詢
    const [currentBlog] = await sequelize.query(blogQuery, {
      replacements: { blogId },
      type: sequelize.QueryTypes.SELECT,
    })

    // 如果沒有找到該文章
    if (!currentBlog) {
      return res.status(404).json({
        error: '找不到該文章，或該文章已被刪除/停用',
      })
    }

    // 成功找到文章，回傳文章資料
    return res.json({
      status: 'success',
      blog: currentBlog,
    })
  } catch (err) {
    console.error('Error fetching blog:', err)
    return res.status(500).json({
      error: '伺服器內部錯誤，請稍後再試',
    })
  }
})

router.put(
  '/myblog/edit/:blogId',
  upload.single('cover_img'), // 處理封面圖片上傳
  authenticate,
  async (req, res) => {
    console.log(req.user)
    try {
      console.log('Request received for updating blog post')
      // const { userID, blogID } = req.params
      const blogId = Number(req.params.blogId) // 從路由參數中獲取文章 ID
      const user_id = req.user.id
      const { title, content, category } = req.body // 解構出需要的參數
      const uploadedCoverImg = req.file ? req.file.filename : null // 如果有上傳新的封面圖片，則保存文件名

      // 確保使用者已經登入，且該用戶能夠編輯該文章
      if (!user_id) {
        return res.status(400).json({
          status: 'error',
          message: '使用者未登入，請重新登入後再試',
        })
      }

      // 查詢該文章是否存在，並檢查其是否屬於當前用戶
      const existingBlog = await sequelize.query(
        'SELECT * FROM blog WHERE id = :blogId AND user_id = :userId',
        {
          replacements: { blogId, userId: user_id },
          type: QueryTypes.SELECT,
        }
      )

      // 如果文章不存在或不屬於當前用戶，返回錯誤
      if (!existingBlog || existingBlog.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: '找不到該文章，或者您沒有權限編輯此文章',
        })
      }

      // 確定封面圖片 URL，如果有新圖片上傳則使用新圖片
      const coverImgUrl = uploadedCoverImg
        ? uploadedCoverImg
        : existingBlog[0].cover_img_url

      // 更新文章資料（這裡不包括 state，因為不能讓用戶修改）
      await sequelize.query(
        `UPDATE blog 
         SET title = :title, 
             content = :content, 
             category_id = :category, 
             updated_at = NOW(), 
             cover_img_url = :coverImgUrl 
         WHERE id = :blogId AND user_id = :userId`,
        {
          replacements: {
            title,
            content,
            category,
            coverImgUrl,
            blogId,
            userId: user_id,
          },
          type: QueryTypes.UPDATE,
        }
      )

      // 返回更新成功的訊息
      res.json({
        status: 'success',
        message: `ID:${blogId} 文章更新成功！`,
        blog: {
          id: blogId,
          title,
          content,
          category,
          cover_img_url: coverImgUrl,
          user_id,
          updated_at: new Date(),
        },
      })
    } catch (error) {
      console.error('更新部落格文章錯誤:', error)
      res.status(500).json({
        status: 'error',
        message: '更新文章失敗，請稍後再試。',
      })
    }
  }
)

// PUT - 軟刪除資料
router.put('/myblog/:userID/:blogID/softdelete', async function (req, res) {
  const { userID, blogID } = req.params // 从路由参数中获取 userID 和 blogID

  try {
    // 使用 Sequelize 的模型更新语句，避免直接拼接 SQL
    const [result] = await sequelize.query(
      `UPDATE blog 
       SET state = 0  -- 假设 "state" 字段表示删除状态
       WHERE id = :blogID AND user_id = :userID`,
      {
        replacements: { blogID, userID }, // 使用 named replacements 来绑定参数
        type: sequelize.QueryTypes.UPDATE, // 明确表示是 UPDATE 查询
      }
    )

    // 如果没有更新任何行，表示帖子可能不存在或者当前用户无权限删除该帖子
    if (result === 0) {
      return res.status(404).json({ error: '未找到該文章或無權刪除' })
    }

    // 返回成功响应
    return res
      .status(200)
      .json({ status: 'success', message: '文章已被軟刪除' })
  } catch (error) {
    console.error('軟刪除錯誤:', error)
    return res.status(500).json({ error: '軟刪除失敗，請稍後再試' })
  }
})

export default router
