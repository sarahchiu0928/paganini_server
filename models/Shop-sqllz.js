import { DataTypes } from 'sequelize'

export default async function (sequelize) {
  return sequelize.define(
    'Shop',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true,
      },
      shop_name: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      shop_area: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      shop_address: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      shop_phone: {
        type: DataTypes.TEXT,
        allowNull: false,
      },
      shop_link: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      shop_opentime: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      locationX: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      locationY: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'shop', //直接提供資料表名稱
      timestamps: true, // 使用時間戳
      paranoid: false, // 軟性刪除
      underscored: true, // 所有自動建立欄位，使用snake_case命名
      createdAt: 'created_at', // 建立的時間戳
      updatedAt: 'updated_at', // 更新的時間戳
    }
  )
}
