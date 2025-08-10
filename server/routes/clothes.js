const Router = require('@koa/router')
const router = new Router()
const clothesController = require('../controllers/clothes');
const multer = require('@koa/multer');
const upload = multer({ storage: multer.memoryStorage() });

router.prefix('/clothes')
// 分析衣物
router.post('/analyze', upload.single('image'), clothesController.analyzeClothes);

module.exports = router;