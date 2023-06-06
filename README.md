# aws-cdk-proxy-instance-with-ec2

ここでは，Proxy Instance を ec2.CfnInstance で作成する．

今回は下記条件の Nat Instance を ec2.CfnInstance で作成した．
- Amazon Linux 2
- t4g.nano (ARM 系 CPU のインスタンス)
- ストレージの暗号化

## 構成図

![](architecture.drawio.png)

## 動作確認

動作確認

```bash
cd ~
http_proxy=http://10.0.0.24:3128
curl google.com -x ${http_proxy}

curl google.com -x http://10.0.0.24:3128
```

Proxy が立ち上がるまで待機が必要な場合．

```bash
cd ~
touch test.sh
chmod +x test.sh
nano test.sh
```
```bash
#!/bin/bash

http_proxy=http://10.0.0.24:3128

MAX_RETRY=10000
INTERVAL=60
for i in $(seq 1 $MAX_RETRY); do
    echo "$i tiems"
    curl -m 60 google.com -x ${http_proxy}
    if [ $? -eq 0 ]; then
        echo "Success"
        break
    else
        sleep $INTERVAL && /bin/false
        echo "Failed"
    fi
done

if [ $? -eq 0 ]; then
    echo "Success"
else
    echo "Failed (Exceed max retry count)"
fi
```

## SSH アクセス (EC2)

```bash
EC2_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=AwsCdkTplStack/General_purpose_ec2" \
    --query "Reservations[].Instances[?State.Name=='running'].InstanceId[]" \
    --output text)
ssh -i ~/.ssh/ec2/id_ed25519 admis@$EC2_INSTANCE_ID
```

## SSH アクセス (NAT)

※ SSM 用の iam role を付けていないので，そのままでは接続できない．

```bash
NAT_INSTANCE_ID=$(aws ec2 describe-instances \
    --filters "Name=tag:Name,Values=AwsCdkTplStack/NatInstance" \
    --query "Reservations[].Instances[?State.Name=='running'].InstanceId[]" \
    --output text)
ssh -i ~/.ssh/ec2/id_ed25519 admis@$NAT_INSTANCE_ID
```

## cloud-config のログ確認

```bash
sudo cat /var/log/cloud-init-output.log
```

## 通信経路のデバッグ

Reachability Analyzer を使う

## 参考資料

- [令和なのに NAT インスタンスを手作りして使ってみた](https://dev.classmethod.jp/articles/nat-instance-handmaid/)
- [NAT インスタンス - AWS/ドキュメント Amazon VPC/ユーザガイド](https://docs.aws.amazon.com/ja_jp/vpc/latest/userguide/VPC_NAT_Instance.html)
- [cdkで不要なルートテーブルを作らずにvpcを作成したメモ](https://qiita.com/hibohiboo/items/cf953c3a0efdcc1e2d9c#%E3%82%BD%E3%83%BC%E3%82%B9)

---

## 付録

### Nodejs のインストール

https://nodejs.org/en/download/releases/ から好きなバージョンを探す．
特にこだわりが無ければ，[サポートサイクルから LTS のバージョン](https://endoflife.date/nodejs) を選択する．

```bash
curl -SLO "https://nodejs.org/dist/latest-v12.x/node-v12.22.3-linux-x64.tar.xz"
sudo tar -xJf ./node-v12.22.3-linux-x64.tar.xz -C /usr/local --strip-components=1 --no-same-owner
rm ./node-v12.22.3-linux-x64.tar.xz
sudo ln -s /usr/local/binnode /usr/local/bin/nodejs
```

### CDK プロジェクトの作成
1. README なしで git リポジトリを生成
2. git clone して cd リポジトリの中に入る
3. CDK の Typescript プロジェクトを作成
   ```bash
   npx cdk init sample-app --language typescript
   ```

### 静的検査
```bash
npx cdk synth
```

### テスト
```
npx npm run test
```
```
npx npm run test -- -u
```

### デプロイ
```bash
npx cdk deploy --all --require-approval never
```
```bash
npx cdk destroy --all --force
```
