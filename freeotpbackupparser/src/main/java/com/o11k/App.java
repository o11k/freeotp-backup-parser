package com.o11k;

import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.io.FileInputStream;
import java.io.ObjectInputStream;
import javax.crypto.SecretKey;

import com.google.gson.Gson;
import com.google.gson.JsonObject;

import org.fedorahosted.freeotp.Token;
import org.fedorahosted.freeotp.encryptor.EncryptedKey;
import org.fedorahosted.freeotp.encryptor.MasterKey;

public class App {
    public static class EncryptedToken {
        public EncryptedKey key;
        public Token token;

        public EncryptedToken(EncryptedKey key, Token token) {
            this.key = key;
            this.token = token;
        }
    }

    public static class BackupFile {
        public MasterKey masterKey;
        public List<EncryptedToken> tokens;

        public BackupFile(MasterKey masterKey, List<EncryptedToken> tokens) {
            this.masterKey = masterKey;
            this.tokens = tokens;
        }
    }

    public static class BadPasswordException extends Exception {}
    
    public static String parseBackupFile(String path) throws Exception {
        FileInputStream fis = new FileInputStream(path);
        ObjectInputStream ois = new ObjectInputStream(fis);
        @SuppressWarnings("unchecked")
        Map<String, String> entries = (Map<String, String>) ois.readObject();
        ois.close();
        fis.close();

        Gson gson = new Gson();

        String masterKeyStr = entries.get("masterKey");
        MasterKey masterKey = gson.fromJson(masterKeyStr, MasterKey.class);

        List<EncryptedToken> tokens = new ArrayList<EncryptedToken>(entries.size() / 2);

        for (Map.Entry<String, String> e : entries.entrySet()) {
            String key = e.getKey();
            String value = e.getValue();
            JsonObject obj;

            if (key.equals("masterKey") || key.contains("-token")) continue;

            obj = gson.fromJson(value, JsonObject.class);
            String tokenKeyStr = obj.get("key").getAsString();
            EncryptedKey tokenKey = gson.fromJson(tokenKeyStr, EncryptedKey.class);

            String tokenStr = entries.get(key + "-token");
            Token token = gson.fromJson(tokenStr, Token.class);

            tokens.add(new EncryptedToken(tokenKey, token));
        }

        BackupFile bf = new BackupFile(masterKey, tokens);

        return gson.toJson(bf);
    }

    public static String decryptBackupFile(String backupFileStr, String password) throws Exception {
        Gson gson = new Gson();
        BackupFile backupFile = gson.fromJson(backupFileStr, BackupFile.class);

        List<String> uris = new ArrayList<String>(backupFile.tokens.size());

        SecretKey secretKey;
        try {
            secretKey = backupFile.masterKey.decrypt(password);
        } catch (Exception e) {
            throw new BadPasswordException();
        }

        for (EncryptedToken eToken : backupFile.tokens) {
            SecretKey tokenSecretKey = eToken.key.decrypt(secretKey);
            String uri = eToken.token.toUri(tokenSecretKey).toString();
            uris.add(uri);
        }

        return gson.toJson(uris);
    }
}
