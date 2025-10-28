package com.o11k;

import java.util.Map;
import java.io.FileInputStream;
import java.io.ObjectInputStream;

public class App {
    public static int parseFreeOTPBackup(String path) throws Exception {
        FileInputStream fis = new FileInputStream(path);
        ObjectInputStream ois = new ObjectInputStream(fis);
        Map<String, ?> entries = (Map<String, ?>) ois.readObject();
        return entries.size();
    }
}
