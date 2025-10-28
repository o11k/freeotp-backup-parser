package com.o11k;

import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.io.FileInputStream;
import java.io.ObjectInputStream;
import com.google.gson.Gson;
import com.google.gson.JsonObject;

import org.fedorahosted.freeotp.encryptor.EncryptedKey;
import org.fedorahosted.freeotp.encryptor.MasterKey;
import org.fedorahosted.freeotp.Token;

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
    
    public static String parseFreeOTPBackup(String path) throws Exception {
        FileInputStream fis = new FileInputStream(path);
        ObjectInputStream ois = new ObjectInputStream(fis);
        Map<String, String> entries = (Map<String, String>) ois.readObject();

        Gson gson = new Gson();

        String masterKeyStr = entries.get("masterKey");
        MasterKey masterKey = gson.fromJson(masterKeyStr, MasterKey.class);

        List tokens = new ArrayList<EncryptedToken>(entries.size() / 2);

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

}
