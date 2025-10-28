package com.o11k;

import java.util.Map;
import java.io.FileInputStream;
import java.io.ObjectInputStream;
import com.google.gson.Gson;

public class App {
    public static String parseFreeOTPBackup(String path) throws Exception {
        FileInputStream fis = new FileInputStream(path);
        ObjectInputStream ois = new ObjectInputStream(fis);
        Map<String, ?> entries = (Map<String, ?>) ois.readObject();

        Gson gson = new Gson();
        return gson.toJson(entries);
    }
}
