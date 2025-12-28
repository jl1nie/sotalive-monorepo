#!/bin/bash
# MyACT テスト実行自動化スクリプト

set -e  # エラー時に停止

echo "=== MyACT テスト実行開始 ==="

# 1. サーバー停止
echo "1. 既存サーバープロセス停止中..."
pkill -f "vite" 2>/dev/null || true
pkill -f "npm run dev" 2>/dev/null || true
sleep 2

# プロセス停止確認
REMAINING_PROCESSES=$(ps aux | grep "vite\|npm run dev" | grep -v grep | wc -l)
if [ "$REMAINING_PROCESSES" -gt 0 ]; then
    echo "⚠️ まだプロセスが残っています:"
    ps aux | grep "vite\|npm run dev" | grep -v grep
    echo "強制終了を試みます..."
    pkill -9 -f "vite" 2>/dev/null || true
    pkill -9 -f "npm" 2>/dev/null || true
    sleep 2
fi

echo "✅ プロセス停止完了"

# 2. 作業ディレクトリ確認・移動
echo "2. 作業ディレクトリ確認中..."
TARGET_DIR="/home/minoru/src/sotalive-vercel/public/myact"

if [ ! -d "$TARGET_DIR" ]; then
    echo "❌ 作業ディレクトリが存在しません: $TARGET_DIR"
    exit 1
fi

cd "$TARGET_DIR"
echo "✅ 作業ディレクトリ: $(pwd)"

# 3. package.jsonの存在確認
if [ ! -f "package.json" ]; then
    echo "❌ package.jsonが見つかりません"
    exit 1
fi

echo "✅ package.json確認完了"

# 4. サーバー起動
echo "3. サーバー起動中..."
npm run dev &
SERVER_PID=$!
echo "サーバーPID: $SERVER_PID"

# サーバー起動待機
echo "サーバー起動を待機中（10秒）..."
sleep 10

# 5. サーバー確認
echo "4. サーバー動作確認中..."
for i in {1..5}; do
    HTTP_STATUS=$(curl -s -w "%{http_code}" http://localhost:5173/myact/ -o /dev/null 2>/dev/null || echo "000")
    if [ "$HTTP_STATUS" = "200" ]; then
        echo "✅ サーバー正常起動 (HTTP $HTTP_STATUS)"
        break
    else
        echo "待機中... (試行 $i/5, HTTP $HTTP_STATUS)"
        sleep 2
    fi
    
    if [ $i -eq 5 ]; then
        echo "❌ サーバー起動失敗 (HTTP $HTTP_STATUS)"
        kill $SERVER_PID 2>/dev/null || true
        exit 1
    fi
done

# 6. HTMLコンテンツ確認
echo "5. HTMLコンテンツ確認中..."
HTML_CHECK=$(curl -s http://localhost:5173/myact/ | grep -E "(React|root)" | wc -l)
if [ "$HTML_CHECK" -gt 0 ]; then
    echo "✅ HTMLコンテンツ正常"
else
    echo "⚠️ HTMLコンテンツに問題がある可能性があります"
fi

# 7. テスト実行
echo "6. テスト実行中..."

echo "--- 基本UIテスト ---"
npx playwright test e2e/basic-ui-test.spec.ts --timeout=45000 --reporter=line

echo "=== テスト完了 ==="
echo "サーバーPID: $SERVER_PID"
echo "サーバーを停止するには: kill $SERVER_PID"
echo "または Ctrl+C でスクリプトを終了してください"

# サーバーの実行を継続
echo "サーバーを継続実行中... (Ctrl+C で停止)"
wait $SERVER_PID